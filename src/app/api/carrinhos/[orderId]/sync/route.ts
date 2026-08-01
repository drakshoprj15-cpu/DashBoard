import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { getSession } from "@/lib/auth/session";
import { getDb, isDatabaseConfigured } from "@/database/client";
import { orders, orderStatusHistory, payments } from "@/database/schema";
import { BroskiApiError, createBroskiProvider } from "@/payment-providers/broski";
import {
  canTransitionOrderStatus,
  ORDER_STATUS_BY_PAYMENT_STATUS,
} from "@/features/carts/status";
import { recordAuditLog } from "@/features/audit/log";

export const dynamic = "force-dynamic";

/** Intervalo mínimo entre sincronizações do mesmo pedido — protege o gateway de cliques repetidos. */
const SYNC_COOLDOWN_MS = 15_000;

/**
 * Sincroniza manualmente o status de um pagamento com o gateway (Broski),
 * pelo backend — a chave da API nunca vai ao navegador. Nunca marca um
 * pedido como pago aqui além do que o próprio gateway confirmar, e nunca
 * rebaixa um pedido já confirmado (`canTransitionOrderStatus`).
 */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/carrinhos/[orderId]/sync">,
) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  if (!process.env.BROSKI_API_KEY) {
    return NextResponse.json(
      { error: "gateway_not_configured", message: "Gateway de pagamento não configurado." },
      { status: 503 },
    );
  }

  const { orderId } = await ctx.params;
  const db = getDb();

  const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!orderRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [paymentRow] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  if (!paymentRow || !paymentRow.externalId) {
    return NextResponse.json(
      {
        error: "no_payment",
        message: "Este carrinho ainda não tem um pagamento criado no gateway.",
      },
      { status: 400 },
    );
  }

  const msSinceUpdate = Date.now() - new Date(paymentRow.updatedAt).getTime();
  if (msSinceUpdate < SYNC_COOLDOWN_MS) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Aguarde alguns segundos antes de sincronizar novamente.",
      },
      { status: 429 },
    );
  }

  const provider = createBroskiProvider({
    environment: "production",
    apiKey: process.env.BROSKI_API_KEY,
    webhookSecret: process.env.BROSKI_WEBHOOK_SECRET,
  });

  let result;
  try {
    result = await provider.getPayment(paymentRow.externalId);
  } catch (error) {
    console.error("[carrinhos/sync] erro ao consultar o gateway:", error);
    const message =
      error instanceof BroskiApiError
        ? `O gateway recusou a consulta: ${error.message}`
        : "Não foi possível consultar o gateway agora. Tente novamente em instantes.";
    return NextResponse.json({ error: "gateway_error", message }, { status: 502 });
  }

  const now = new Date();

  await db
    .update(payments)
    .set({
      status: result.status,
      approvedAt: result.status === "approved" ? now : paymentRow.approvedAt,
      updatedAt: now,
    })
    .where(eq(payments.id, paymentRow.id));

  const newOrderStatus = ORDER_STATUS_BY_PAYMENT_STATUS[result.status];
  let orderStatusChanged = false;

  if (newOrderStatus && canTransitionOrderStatus(orderRow.status, newOrderStatus)) {
    await db
      .update(orders)
      .set({
        status: newOrderStatus as (typeof orders.$inferInsert)["status"],
        paidAt: result.status === "approved" ? now : orderRow.paidAt,
        updatedAt: now,
      })
      .where(eq(orders.id, orderId));

    await db.insert(orderStatusHistory).values({
      workspaceId: orderRow.workspaceId,
      orderId,
      fromStatus: orderRow.status as (typeof orderStatusHistory.$inferInsert)["fromStatus"],
      toStatus: newOrderStatus as (typeof orderStatusHistory.$inferInsert)["toStatus"],
      reason: "Sincronização manual com o gateway",
      changedBy: null,
      metadata: { source: "manual_sync", providerKey: "broski" },
    });
    orderStatusChanged = true;
  }

  await recordAuditLog({
    action: "cart.status_synced",
    entityType: "order",
    entityId: orderId,
    changes: {
      providerStatus: result.status,
      orderStatusChanged,
      newOrderStatus: orderStatusChanged ? newOrderStatus : undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    paymentStatus: result.status,
    orderStatus: orderStatusChanged ? newOrderStatus : orderRow.status,
    syncedAt: now.toISOString(),
  });
}
