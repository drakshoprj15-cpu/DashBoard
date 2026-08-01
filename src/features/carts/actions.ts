"use server";

import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured, type Database } from "@/database/client";
import { customers, emailSuppressions, orderItems, orders, orderStatusHistory } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getSession } from "@/lib/auth/session";
import { isResendConfigured, sendEmail } from "@/features/emails/resend-provider";
import { company } from "@/lib/company";
import { formatMoney } from "@/lib/format";
import { recordAuditLog } from "@/features/audit/log";
import { canTransitionOrderStatus } from "@/features/carts/status";

export interface CartActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

/** Intervalo mínimo entre lembretes do mesmo pedido — evita spam por reenvio acidental. */
const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/** Pedidos ainda não resolvidos são os únicos que um admin pode cancelar manualmente. */
const CANCELLABLE_STATUSES = ["created", "awaiting_payment", "processing"];

function reminderHtml(
  customerName: string,
  reference: string,
  productName: string | null,
  totalCents: number,
  currency: string,
): string {
  const amount = formatMoney(totalCents, currency, "pt-PT");
  return `<!doctype html><html lang="pt"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-size:20px;font-weight:800">${company.tradeName}</p>
<p style="margin:0 0 14px;line-height:1.6">Olá ${customerName},</p>
<p style="margin:0 0 14px;line-height:1.6">Reparámos que o seu pedido <strong>${reference}</strong>${
    productName ? ` (${productName})` : ""
  } no valor de <strong>${amount}</strong> ainda está por pagar.</p>
<p style="margin:0 0 14px;line-height:1.6">Se ainda tiver interesse, pode concluir o pagamento a qualquer momento.</p>
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
  };
}

/**
 * Envia um lembrete de pagamento pendente para o cliente de um carrinho.
 * Respeita opt-out/bloqueio/supressão e nunca reenvia dentro do intervalo
 * de cooldown — mesma regra usada no envio em massa.
 */
export async function sendCartReminderAction(orderId: string): Promise<CartActionResult> {
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

  const html = reminderHtml(
    eligibility.name,
    order.reference,
    item?.productName ?? null,
    Number(order.totalCents),
    order.currency,
  );

  const result = await sendEmail({
    to: eligibility.email,
    subject: `O seu pedido ${order.reference} ainda está por pagar`,
    html,
    replyTo: company.email,
    idempotencyKey: `reminder_${orderId}_${new Date().toISOString().slice(0, 13)}`,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Falha ao enviar o lembrete." };
  }

  const now = new Date();
  await db.update(orders).set({ lastReminderSentAt: now, updatedAt: now }).where(eq(orders.id, orderId));

  await recordAuditLog({
    action: "cart.reminder_sent",
    entityType: "order",
    entityId: orderId,
    changes: { email: eligibility.email },
  });

  return { ok: true, message: `Lembrete enviado para ${eligibility.email}.` };
}

export interface BulkReminderResult {
  ok: boolean;
  sent: number;
  skipped: number;
  errors: string[];
}

/** Envia lembretes em massa — reaproveita `sendCartReminderAction` por pedido. */
export async function bulkSendReminderAction(orderIds: string[]): Promise<BulkReminderResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, sent: 0, skipped: orderIds.length, errors: ["Não autenticado."] };
  }
  if (orderIds.length === 0) {
    return { ok: false, sent: 0, skipped: 0, errors: ["Nenhum carrinho selecionado."] };
  }
  if (orderIds.length > 200) {
    return { ok: false, sent: 0, skipped: orderIds.length, errors: ["Selecione no máximo 200 carrinhos por vez."] };
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const orderId of orderIds) {
    const result = await sendCartReminderAction(orderId);
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
