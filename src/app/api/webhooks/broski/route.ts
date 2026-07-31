import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customers,
  ledgerEntries,
  orders,
  payments,
  paymentWebhooks,
  payouts,
} from "@/database/schema";
import { createBroskiProvider } from "@/payment-providers/broski";
import { sendPurchaseToMetaCapi } from "@/features/pixels/meta-capi";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  createNotification,
  type NotificationEvent,
} from "@/features/notifications/create";
import {
  sendPushcutNotification,
  shouldPushEvent,
} from "@/features/notifications/pushcut";

/** Que notificação gerar para cada estado devolvido pelo gateway. */
const NOTIFICATION_BY_STATUS: Record<
  string,
  { eventType: NotificationEvent; title: string }
> = {
  approved: { eventType: "payment_approved", title: "Pagamento confirmado" },
  refused: { eventType: "payment_refused", title: "Pagamento recusado" },
  expired: { eventType: "payment_refused", title: "Pagamento expirado" },
  refunded: { eventType: "refund", title: "Reembolso processado" },
  chargeback: { eventType: "chargeback", title: "Chargeback aberto" },
};

/**
 * Webhook do Broski (POST https://<dominio>/api/webhooks/broski).
 *
 * Regras (docs/PAYMENTS.md):
 * - Assinatura `Broski-Signature` SEMPRE verificada (HMAC-SHA256, ±5 min)
 * - Entrega at-least-once → deduplicação por id do evento (unique no banco)
 * - Responder 2xx em até 10 s (sem 2xx o Broski faz retries por ~24 h)
 * - Pedido só é marcado como pago aqui (order.paid), nunca no frontend
 *
 * Ativação: registrar a URL no painel Broski e definir BROSKI_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  if (!process.env.BROSKI_API_KEY || !isDatabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!process.env.BROSKI_WEBHOOK_SECRET) {
    // Sem segredo não há como validar autenticidade — rejeitar sempre.
    return NextResponse.json({ error: "webhook_secret_missing" }, { status: 503 });
  }

  const provider = createBroskiProvider({
    environment: "production",
    apiKey: process.env.BROSKI_API_KEY,
    webhookSecret: process.env.BROSKI_WEBHOOK_SECRET,
  });

  const rawBody = await request.text();

  const valid = await provider.verifyWebhookSignature(request, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const event = await provider.parseWebhook(rawBody);
  const db = getDb();

  // Deduplicação: unique (provider_key, external_event_id)
  const inserted = await db
    .insert(paymentWebhooks)
    .values({
      providerKey: "broski",
      externalEventId: event.externalEventId,
      eventType: event.type,
      signatureValid: true,
      payload: { type: event.type, paymentExternalId: event.paymentExternalId },
    })
    .onConflictDoNothing()
    .returning({ id: paymentWebhooks.id });

  if (inserted.length === 0) {
    // Evento já processado anteriormente
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.paymentExternalId && event.status) {
    const paymentRows = await db
      .select({ id: payments.id, orderId: payments.orderId })
      .from(payments)
      .where(eq(payments.externalId, event.paymentExternalId))
      .limit(1);

    if (paymentRows.length > 0) {
      const { id: paymentId, orderId } = paymentRows[0];
      const now = new Date();

      await db
        .update(payments)
        .set({
          status: event.status,
          approvedAt: event.status === "approved" ? now : undefined,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId));

      const orderStatusByPayment: Record<string, string> = {
        approved: "paid",
        refused: "refused",
        expired: "expired",
        refunded: "refunded",
        chargeback: "chargeback",
      };
      const newOrderStatus = orderStatusByPayment[event.status];
      if (newOrderStatus) {
        await db
          .update(orders)
          .set({
            status: newOrderStatus as (typeof orders.$inferInsert)["status"],
            paidAt: event.status === "approved" ? now : undefined,
            updatedAt: now,
          })
          .where(eq(orders.id, orderId));
      }

      await db
        .update(paymentWebhooks)
        .set({ processedAt: now, paymentId })
        .where(eq(paymentWebhooks.id, inserted[0].id));

      // Efeitos posteriores (Meta CAPI, notificação in-app) nunca podem
      // impedir a resposta 2xx ao Broski: sem 2xx ele reenvia por ~24h, e o
      // pagamento já foi processado com sucesso aqui em cima.
      try {
        const [orderRow] = await db
          .select({
            workspaceId: orders.workspaceId,
            reference: orders.reference,
            totalCents: orders.totalCents,
            currency: orders.currency,
            customerId: orders.customerId,
          })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);

        if (orderRow) {
          // Lançamento automático no livro-caixa (Financeiro → Entradas/Saídas).
          // Usa o valor bruto do pedido — o Broski não retorna a taxa cobrada
          // em nenhum ponto do fluxo, então nunca lançamos gateway_fee aqui.
          const LEDGER_ENTRY_BY_STATUS: Partial<
            Record<string, { type: "sale" | "refund" | "chargeback"; direction: "in" | "out" }>
          > = {
            approved: { type: "sale", direction: "in" },
            refunded: { type: "refund", direction: "out" },
            chargeback: { type: "chargeback", direction: "out" },
          };
          const ledgerPlan = LEDGER_ENTRY_BY_STATUS[event.status];
          if (ledgerPlan) {
            await db.insert(ledgerEntries).values({
              workspaceId: orderRow.workspaceId,
              type: ledgerPlan.type,
              direction: ledgerPlan.direction,
              description: `Pedido ${orderRow.reference}`,
              amountCents: orderRow.totalCents,
              currency: orderRow.currency,
              status: "confirmed",
              orderId,
              paymentId,
              gatewayKey: "broski",
            });
          }

          const [customerRow] = orderRow.customerId
            ? await db
                .select({ email: customers.email, phone: customers.phone })
                .from(customers)
                .where(eq(customers.id, orderRow.customerId))
                .limit(1)
            : [undefined];

          // Purchase só é reportado à Meta após confirmação real do gateway.
          if (event.status === "approved" && orderRow.customerId) {
            await sendPurchaseToMetaCapi({
              workspaceId: orderRow.workspaceId,
              orderId,
              eventId: `purchase_${orderId}`,
              valueCents: orderRow.totalCents,
              currency: orderRow.currency,
              email: customerRow?.email,
              phone: customerRow?.phone,
            });
          }

          const notice = NOTIFICATION_BY_STATUS[event.status];
          if (notice) {
            const amount = (orderRow.totalCents / 100).toLocaleString("pt-PT", {
              style: "currency",
              currency: orderRow.currency,
            });
            const detail = `Pedido ${orderRow.reference}${
              customerRow?.email ? ` · ${customerRow.email}` : ""
            }`;

            await createNotification({
              workspaceId: orderRow.workspaceId,
              eventType: notice.eventType,
              title: notice.title,
              body: detail,
              href: "/pedidos",
              valueCents: orderRow.totalCents,
              metadata: { orderId, reference: orderRow.reference },
            });

            // Push no telemóvel, se o utilizador escolheu este evento.
            if (await shouldPushEvent(notice.eventType)) {
              await sendPushcutNotification(
                `${notice.title} · ${amount}`,
                detail,
              );
            }
          }
        }
      } catch (error) {
        console.error("[webhook/broski] erro nos efeitos pós-pagamento:", error);
      }
    }
  } else if (event.type === "payout.paid") {
    // Suporte defensivo: a Broski documenta este evento (docs/PAYMENTS.md),
    // mas o formato exato do objeto "payout" nunca foi confirmado com um
    // evento real (sem credenciais de produção até agora). Lemos o payload
    // cru com fallback em vários nomes de campo plausíveis, sem travar o
    // resto do webhook se algum campo vier diferente do esperado — quando o
    // primeiro evento real chegar, este parsing deve ser revisado e travado
    // ao formato confirmado.
    try {
      const raw = event.raw as {
        data?: { object?: Record<string, unknown> };
      };
      const payoutObject = raw?.data?.object ?? {};

      const externalId =
        typeof payoutObject.id === "string" ? payoutObject.id : event.externalEventId;
      const amountCents =
        typeof payoutObject.amount === "number" ? payoutObject.amount : event.amountCents;
      const currency =
        typeof payoutObject.currency === "string" ? payoutObject.currency.toUpperCase() : "EUR";
      const arrivedAtRaw =
        (payoutObject.paid_at as string | undefined) ??
        (payoutObject.arrived_at as string | undefined);
      const bankAccountLabel =
        (payoutObject.bank_account as string | undefined) ??
        (payoutObject.destination as string | undefined) ??
        null;

      if (typeof amountCents === "number") {
        const workspaceId = await getOrCreateDefaultWorkspace();

        await db
          .insert(payouts)
          .values({
            workspaceId,
            externalId,
            status: "paid",
            amountCents,
            currency,
            source: "api",
            bankAccountLabel,
            arrivedAt: arrivedAtRaw ? new Date(arrivedAtRaw) : new Date(),
          })
          .onConflictDoUpdate({
            target: payouts.externalId,
            set: {
              status: "paid",
              amountCents,
              currency,
              arrivedAt: arrivedAtRaw ? new Date(arrivedAtRaw) : new Date(),
              updatedAt: new Date(),
            },
          });
      } else {
        console.error(
          "[webhook/broski] evento payout.paid sem valor reconhecível — payload:",
          JSON.stringify(payoutObject),
        );
      }

      await db
        .update(paymentWebhooks)
        .set({ processedAt: new Date() })
        .where(eq(paymentWebhooks.id, inserted[0].id));
    } catch (error) {
      console.error("[webhook/broski] erro ao processar payout.paid:", error);
    }
  }

  return NextResponse.json({ received: true });
}
