import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { orders, payments } from "@/database/schema";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Estado de uma cobrança de link de pagamento (`/pagar/[slug]`).
 *
 * Endpoint público por necessidade: quem está a pagar não tem sessão. O que
 * o torna seguro:
 * - o `orderId` é um UUID aleatório, não um id sequencial adivinhável;
 * - a resposta traz apenas o estado e o valor — nada de dados do comprador,
 *   do workspace ou do gateway;
 * - só responde para pedidos originados em link de pagamento.
 *
 * A página faz polling daqui enquanto espera; a confirmação real continua a
 * vir do webhook do gateway, nunca desta leitura.
 */

/** orders.status → estado mostrado ao comprador. */
const PUBLIC_STATE: Record<string, string> = {
  created: "pending",
  awaiting_payment: "pending",
  processing: "processing",
  paid: "paid",
  shipped: "paid",
  delivered: "paid",
  refused: "failed",
  expired: "expired",
  cancelled: "cancelled",
  refunded: "refunded",
  chargeback: "refunded",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;

  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(orderId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const client =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown-client";
  const limit = await rateLimit({
    namespace: "payment-link-status",
    identifier: `${orderId}:${client}`,
    limit: 120,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({
        status: orders.status,
        totalCents: orders.totalCents,
        currency: orders.currency,
        paidAt: orders.paidAt,
        paymentLinkId: orders.paymentLinkId,
        method: payments.method,
      })
      .from(orders)
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .where(and(eq(orders.id, orderId)))
      .limit(1);

    if (!row?.paymentLinkId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        state: PUBLIC_STATE[row.status] ?? "pending",
        totalCents: row.totalCents,
        currency: row.currency,
        method: row.method,
        paidAt: row.paidAt?.toISOString() ?? null,
      },
      // Estado de pagamento nunca pode vir de cache intermediária.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[payment-links] falha ao consultar estado:", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
