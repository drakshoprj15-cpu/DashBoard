"use server";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured, type Database } from "@/database/client";
import { customers, emailSuppressions, orderItems, orders, orderStatusHistory } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getSession } from "@/lib/auth/session";
import { isResendConfigured, sendEmail } from "@/features/emails/resend-provider";
import { company } from "@/lib/company";
import { formatMoney } from "@/lib/format";
import { recordAuditLog } from "@/features/audit/log";
import { recordCartEvent } from "@/features/carts/events";
import { MAX_BULK_ORDERS } from "@/features/carts/limits";
import {
  PAID_ORDER_STATUSES,
  canTransitionOrderStatus,
  resolveCartCategory,
} from "@/features/carts/status";
import {
  CART_TEMPLATES,
  buildTemplateVars,
  renderTemplate,
  suggestTemplate,
  type CartTemplateKey,
} from "@/features/carts/templates";

export interface CartActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

/** Intervalo mínimo entre lembretes do mesmo pedido — evita spam por reenvio acidental. */
const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/** Pedidos ainda não resolvidos são os únicos que um admin pode cancelar manualmente. */
const CANCELLABLE_STATUSES = ["created", "awaiting_payment", "processing"];

const PAID_STATUSES = PAID_ORDER_STATUSES;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Envolve o corpo já renderizado do template no layout de e-mail da marca.
 * O corpo vem de template fixo + variáveis do próprio pedido, mas é escapado
 * na mesma — nome e produto são dados que o cliente controla, e uma planilha
 * importada pode trazer qualquer coisa neles.
 */
function reminderHtml(
  body: string,
  preview: string,
  reference: string,
  totalCents: number,
  currency: string,
  checkoutUrl: string | null,
): string {
  const amount = formatMoney(totalCents, currency, "pt-PT");
  const safeBody = escapeHtml(body).replace(/\n/g, "<br>");

  // Sem link de pagamento não há botão — e o corpo do modelo remete a "o
  // botão abaixo". Nesse caso a mensagem tem de oferecer um caminho real,
  // senão o e-mail pede uma ação que não existe.
  const hasCheckout = checkoutUrl && /^https?:\/\//.test(checkoutUrl);
  const cta = hasCheckout
    ? `<p style="margin:0 0 20px"><a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;background:#d61f69;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">Concluir meu pedido</a></p>`
    : `<p style="margin:0 0 20px;line-height:1.6">Responda a este e-mail e enviamos o link de pagamento em seguida.</p>`;

  // Preheader: o que a caixa de entrada mostra depois do assunto. Fica
  // escondido no corpo (display:none + altura zero) e é seguido de espaços
  // invisíveis, senão o cliente de e-mail preenche o resto da linha com o
  // início do HTML — normalmente o nome da marca repetido.
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>`;

  return `<!doctype html><html lang="pt"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
${preheader}
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-size:20px;font-weight:800">${company.tradeName}</p>
<p style="margin:0 0 18px;line-height:1.6">${safeBody}</p>
${cta}
<p style="margin:0 0 18px;line-height:1.6;color:#52525b;font-size:14px">Pedido <strong>${escapeHtml(reference)}</strong> — <strong>${amount}</strong>.</p>
<p style="margin:0;line-height:1.6;color:#52525b;font-size:14px">Qualquer dúvida, é só responder a este e-mail.<br>— ${company.tradeName}</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #e4e4e7">
<p style="margin:0;font-size:12px;color:#71717a">
Recebeu este e-mail porque iniciou uma compra em ${company.tradeName}.<br>
Para deixar de receber, responda a este e-mail com "REMOVER".
</p>
</div></body></html>`;
}

interface ReminderEligibility {
  eligible: boolean;
  reason?: string;
  email?: string;
  name?: string;
  phone?: string | null;
}

async function checkReminderEligibility(
  db: Database,
  workspaceId: string,
  customerId: string,
): Promise<ReminderEligibility> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return { eligible: false, reason: "Cliente não encontrado." };
  if (customer.marketingOptOut) {
    return { eligible: false, reason: "O cliente pediu para não receber comunicações." };
  }
  if (customer.isBlocked) {
    return { eligible: false, reason: "O cliente está bloqueado." };
  }

  const [suppressed] = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.workspaceId, workspaceId), eq(emailSuppressions.email, customer.email)))
    .limit(1);
  if (suppressed) {
    return { eligible: false, reason: "O e-mail está na lista de supressão." };
  }

  return {
    eligible: true,
    email: customer.email,
    name: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email,
    phone: customer.phone,
  };
}

/**
 * Envia um lembrete de pagamento pendente para o cliente de um carrinho.
 * Respeita opt-out/bloqueio/supressão e nunca reenvia dentro do intervalo
 * de cooldown — mesma regra usada no envio em massa.
 */
export async function sendCartReminderAction(
  orderId: string,
  templateKey?: CartTemplateKey,
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, error: "Não autenticado." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: "Envio de e-mails ainda não está ativo (configure RESEND_API_KEY e RESEND_FROM_EMAIL).",
    };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)))
    .limit(1);
  if (!order) return { ok: false, error: "Carrinho não encontrado." };
  if (!order.customerId) return { ok: false, error: "Este pedido não tem cliente associado." };

  if (
    order.lastReminderSentAt &&
    Date.now() - new Date(order.lastReminderSentAt).getTime() < REMINDER_COOLDOWN_MS
  ) {
    return {
      ok: false,
      error: "Já foi enviado um lembrete recentemente para este pedido. Aguarde antes de reenviar.",
    };
  }

  const eligibility = await checkReminderEligibility(db, workspaceId, order.customerId);
  if (!eligibility.eligible || !eligibility.email || !eligibility.name) {
    return { ok: false, error: eligibility.reason ?? "Cliente não elegível para lembrete." };
  }

  const [item] = await db
    .select({ productName: orderItems.productName })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .limit(1);

  const category = resolveCartCategory(
    order.status,
    (Date.now() - new Date(order.updatedAt).getTime()) / 3_600_000,
    order.recoveredManuallyAt,
  );
  const template = CART_TEMPLATES[templateKey ?? suggestTemplate(category)];

  const vars = buildTemplateVars({
    customerName: eligibility.name,
    customerEmail: eligibility.email,
    customerPhone: eligibility.phone ?? null,
    productName: item?.productName ?? null,
    totalCents: Number(order.totalCents),
    currency: order.currency,
    category,
    checkoutUrl: order.checkoutUrl,
    createdAt: order.createdAt,
  });

  const html = reminderHtml(
    renderTemplate(template.emailBody, vars),
    renderTemplate(template.preview, vars),
    order.reference,
    Number(order.totalCents),
    order.currency,
    order.checkoutUrl,
  );

  const result = await sendEmail({
    to: eligibility.email,
    subject: renderTemplate(template.subject, vars),
    html,
    replyTo: company.email,
    idempotencyKey: `reminder_${orderId}_${new Date().toISOString().slice(0, 13)}`,
  });

  if (!result.ok) {
    await recordCartEvent({
      workspaceId,
      orderId,
      type: "reminder_failed",
      channel: "email",
      message: result.error ?? "Falha no envio",
      createdBy: session.user.id,
    });
    return { ok: false, error: result.error ?? "Falha ao enviar o lembrete." };
  }

  const now = new Date();
  await db
    .update(orders)
    .set({
      lastReminderSentAt: now,
      lastReminderChannel: "email",
      reminderCount: sql`${orders.reminderCount} + 1`,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));

  await recordCartEvent({
    workspaceId,
    orderId,
    type: "email_sent",
    channel: "email",
    message: `Template "${template.label}" enviado.`,
    metadata: { template: template.key },
    createdBy: session.user.id,
  });

  await recordAuditLog({
    action: "cart.reminder_sent",
    entityType: "order",
    entityId: orderId,
    changes: { email: eligibility.email, template: template.key },
  });

  return { ok: true, message: `Lembrete enviado para ${eligibility.email}.` };
}

/**
 * Regista que o operador iniciou a recuperação por WhatsApp.
 *
 * Não envia mensagem nenhuma — o envio acontece no aplicativo do operador,
 * via link `wa.me`. Ver `whatsapp-provider.ts` para o porquê de não haver
 * disparo automático.
 */
export async function logWhatsAppReminderAction(orderId: string): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, error: "Não autenticado." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [order] = await db
    .select({ id: orders.id, customerId: orders.customerId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)))
    .limit(1);
  if (!order) return { ok: false, error: "Carrinho não encontrado." };

  if (order.customerId) {
    const [customer] = await db
      .select({ marketingOptOut: customers.marketingOptOut, isBlocked: customers.isBlocked })
      .from(customers)
      .where(eq(customers.id, order.customerId))
      .limit(1);
    if (customer?.marketingOptOut) {
      return { ok: false, error: "O cliente pediu para não receber comunicações." };
    }
    if (customer?.isBlocked) {
      return { ok: false, error: "O cliente está bloqueado." };
    }
  }

  const now = new Date();
  await db
    .update(orders)
    .set({
      lastReminderSentAt: now,
      lastReminderChannel: "whatsapp",
      reminderCount: sql`${orders.reminderCount} + 1`,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));

  await recordCartEvent({
    workspaceId,
    orderId,
    type: "whatsapp_opened",
    channel: "whatsapp",
    message: "Conversa aberta no WhatsApp pelo operador.",
    createdBy: session.user.id,
  });

  await recordAuditLog({
    action: "cart.whatsapp_opened",
    entityType: "order",
    entityId: orderId,
  });

  return { ok: true, message: "Lembrete por WhatsApp registado." };
}

export type CartStatusMark = "recovered" | "refused" | "pending";

/**
 * Marcação manual de status pelo operador.
 *
 * "Recuperado" grava `recovered_manually_at` e **nunca** `status = 'paid'`:
 * receita em todo o painel vem de `orders.status`, e só a confirmação do
 * gateway pode produzi-la. As demais marcações passam por
 * `canTransitionOrderStatus`, que impede rebaixar um pedido já pago.
 */
export async function markCartStatusAction(
  orderId: string,
  mark: CartStatusMark,
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, error: "Não autenticado." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)))
    .limit(1);
  if (!order) return { ok: false, error: "Carrinho não encontrado." };

  const now = new Date();

  if (mark === "recovered") {
    if (PAID_STATUSES.includes(order.status)) {
      return { ok: false, error: "Este pedido já foi pago e confirmado pelo gateway." };
    }
    if (order.recoveredManuallyAt) {
      return { ok: false, error: "Este carrinho já está marcado como recuperado." };
    }
    await db
      .update(orders)
      .set({ recoveredManuallyAt: now, updatedAt: now })
      .where(eq(orders.id, orderId));

    await recordCartEvent({
      workspaceId,
      orderId,
      type: "status_changed",
      message: "Marcado como recuperado manualmente (não entra em receita).",
      metadata: { mark },
      createdBy: session.user.id,
    });
    await recordAuditLog({
      action: "cart.marked_recovered",
      entityType: "order",
      entityId: orderId,
    });
    return { ok: true, message: "Carrinho marcado como recuperado." };
  }

  const nextStatus = mark === "refused" ? "refused" : "processing";
  if (!canTransitionOrderStatus(order.status, nextStatus)) {
    return {
      ok: false,
      error: "Este pedido já está num estado mais avançado — a marcação não pode retroceder o status.",
    };
  }

  await db
    .update(orders)
    .set({
      status: nextStatus as (typeof orders.$inferInsert)["status"],
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));

  await db.insert(orderStatusHistory).values({
    workspaceId,
    orderId,
    fromStatus: order.status as (typeof orderStatusHistory.$inferInsert)["fromStatus"],
    toStatus: nextStatus as (typeof orderStatusHistory.$inferInsert)["toStatus"],
    reason: "Marcação manual na central de recuperação",
    changedBy: session.user.id,
    metadata: { source: "admin_override" },
  });

  await recordCartEvent({
    workspaceId,
    orderId,
    type: "status_changed",
    message: `Status alterado manualmente para "${nextStatus}".`,
    metadata: { from: order.status, to: nextStatus },
    createdBy: session.user.id,
  });

  await recordAuditLog({
    action: "cart.status_marked",
    entityType: "order",
    entityId: orderId,
    changes: { from: order.status, to: nextStatus },
  });

  return { ok: true, message: mark === "refused" ? "Marcado como recusado." : "Marcado como pendente." };
}

/** Arquiva (ou desarquiva) carrinhos — some da listagem sem perder o histórico. */
export async function archiveCartsAction(
  orderIds: string[],
  archived: boolean,
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, error: "Não autenticado." };
  }
  if (orderIds.length === 0) return { ok: false, error: "Nenhum carrinho selecionado." };
  if (orderIds.length > MAX_BULK_ORDERS) {
    return { ok: false, error: `Selecione no máximo ${MAX_BULK_ORDERS} carrinhos por vez.` };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const now = new Date();

  const updated = await db
    .update(orders)
    .set({ archivedAt: archived ? now : null, updatedAt: now })
    .where(and(eq(orders.workspaceId, workspaceId), inArray(orders.id, orderIds)))
    .returning({ id: orders.id });

  for (const row of updated) {
    await recordCartEvent({
      workspaceId,
      orderId: row.id,
      type: "archived",
      message: archived ? "Carrinho arquivado." : "Carrinho desarquivado.",
      createdBy: session.user.id,
    });
  }

  await recordAuditLog({
    action: archived ? "cart.archived" : "cart.unarchived",
    entityType: "order",
    changes: { count: updated.length },
  });

  return {
    ok: true,
    message: archived
      ? `${updated.length} ${updated.length === 1 ? "carrinho arquivado" : "carrinhos arquivados"}.`
      : `${updated.length} ${updated.length === 1 ? "carrinho restaurado" : "carrinhos restaurados"}.`,
  };
}

export interface BulkReminderResult {
  ok: boolean;
  sent: number;
  skipped: number;
  errors: string[];
}

/** Envia lembretes em massa — reaproveita `sendCartReminderAction` por pedido. */
export async function bulkSendReminderAction(
  orderIds: string[],
  templateKey?: CartTemplateKey,
): Promise<BulkReminderResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, sent: 0, skipped: orderIds.length, errors: ["Não autenticado."] };
  }
  if (orderIds.length === 0) {
    return { ok: false, sent: 0, skipped: 0, errors: ["Nenhum carrinho selecionado."] };
  }
  if (orderIds.length > MAX_BULK_ORDERS) {
    return {
      ok: false,
      sent: 0,
      skipped: orderIds.length,
      errors: [`Selecione no máximo ${MAX_BULK_ORDERS} carrinhos por vez.`],
    };
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const orderId of orderIds) {
    const result = await sendCartReminderAction(orderId, templateKey);
    if (result.ok) {
      sent += 1;
    } else {
      skipped += 1;
      if (result.error) errors.push(result.error);
    }
  }

  return { ok: sent > 0, sent, skipped, errors: Array.from(new Set(errors)).slice(0, 10) };
}

/**
 * Cancelamento administrativo — o único override manual de status permitido
 * nesta página. Nunca aplicável a pedidos já pagos/reembolsados/em
 * chargeback, exige motivo e fica registado em auditoria + no histórico do
 * pedido. "Pago" nunca é alcançável por aqui — só pela confirmação real do
 * gateway (webhook/sincronização).
 */
export async function cancelCartOrderAction(orderId: string, reason: string): Promise<CartActionResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, error: "Não autenticado." };
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 5) {
    return { ok: false, error: "Informe um motivo para o cancelamento (mínimo 5 caracteres)." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)))
    .limit(1);
  if (!order) return { ok: false, error: "Carrinho não encontrado." };

  if (!CANCELLABLE_STATUSES.includes(order.status) || !canTransitionOrderStatus(order.status, "cancelled")) {
    return {
      ok: false,
      error: "Este pedido não pode ser cancelado manualmente — só pedidos ainda não pagos e não resolvidos.",
    };
  }

  const now = new Date();
  await db
    .update(orders)
    .set({
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
      internalNotes: order.internalNotes ? `${order.internalNotes}\n${trimmedReason}` : trimmedReason,
    })
    .where(eq(orders.id, orderId));

  await db.insert(orderStatusHistory).values({
    workspaceId,
    orderId,
    fromStatus: order.status as (typeof orderStatusHistory.$inferInsert)["fromStatus"],
    toStatus: "cancelled",
    reason: trimmedReason,
    changedBy: session.user.id,
    metadata: { source: "admin_override" },
  });

  await recordAuditLog({
    action: "cart.cancelled",
    entityType: "order",
    entityId: orderId,
    changes: { reason: trimmedReason },
  });

  return { ok: true, message: "Pedido cancelado." };
}
