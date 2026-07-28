import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { orders, payments, paymentWebhooks } from "@/database/schema";
import { createBroskiProvider } from "@/payment-providers/broski";

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
    }
  }

  return NextResponse.json({ received: true });
}
