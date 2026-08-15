import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customers,
  integrationDeliveries,
  integrationDeliveryAttempts,
  integrations,
  orderItems,
  orders,
  payments,
} from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  buildUtmifyPayload,
  postUtmifyOrder,
  retryDelayMs,
  UTMIFY_STATUS_BY_ORDER_STATUS,
  type UtmifySaleStatus,
} from "@/features/pixels/utmify-core";

const MAX_BATCH = 20;
const STALE_LOCK_MS = 5 * 60_000;

interface SafeIntegrationConfig {
  credentialName?: string;
  platform?: string;
  tokenPreview?: string;
}

function configOf(value: unknown): SafeIntegrationConfig {
  return value && typeof value === "object"
    ? (value as SafeIntegrationConfig)
    : {};
}

export async function enqueueUtmifyOrderUpdate(
  workspaceId: string,
  orderId: string,
  orderStatus: string,
): Promise<string[]> {
  const saleStatus = UTMIFY_STATUS_BY_ORDER_STATUS[orderStatus];
  if (!saleStatus || !isDatabaseConfigured()) return [];

  const db = getDb();
  const active = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.key, "utmify"),
        eq(integrations.isActive, true),
        eq(integrations.status, "connected"),
      ),
    );

  const ids: string[] = [];
  for (const integration of active) {
    const [inserted] = await db
      .insert(integrationDeliveries)
      .values({
        workspaceId,
        integrationId: integration.id,
        orderId,
        saleStatus,
        idempotencyKey: `${workspaceId}:${integration.id}:${orderId}:${saleStatus}`,
      })
      .onConflictDoNothing()
      .returning({ id: integrationDeliveries.id });
    if (inserted) ids.push(inserted.id);
  }
  return ids;
}

export function scheduleUtmifyDeliveries(ids?: string[]): void {
  after(async () => {
    try {
      if (ids?.length) {
        for (const id of ids) await processUtmifyDelivery(id);
      } else {
        await processUtmifyOutbox();
      }
    } catch (error) {
      console.error("[utmify/outbox] falha sanitizada ao processar fila", {
        kind: error instanceof Error ? error.name : "unknown",
      });
    }
  });
}

async function loadDeliverySource(deliveryId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      delivery: integrationDeliveries,
      integration: integrations,
      order: orders,
      customer: customers,
    })
    .from(integrationDeliveries)
    .innerJoin(integrations, eq(integrations.id, integrationDeliveries.integrationId))
    .innerJoin(orders, eq(orders.id, integrationDeliveries.orderId))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(integrationDeliveries.id, deliveryId))
    .limit(1);
  if (!row) return null;

  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.orderId, row.order.id),
        eq(payments.workspaceId, row.delivery.workspaceId),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);
  const items = await db
    .select()
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, row.order.id),
        eq(orderItems.workspaceId, row.delivery.workspaceId),
      ),
    );
  return { ...row, payment, items };
}

export async function processUtmifyDelivery(deliveryId: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();
  const now = new Date();
  const lockToken = randomUUID();

  const [claimed] = await db
    .update(integrationDeliveries)
    .set({ status: "processing", lockToken, lockedAt: now, updatedAt: now })
    .where(
      and(
        eq(integrationDeliveries.id, deliveryId),
        eq(integrationDeliveries.status, "pending"),
        lte(integrationDeliveries.nextAttemptAt, now),
      ),
    )
    .returning({ id: integrationDeliveries.id });
  if (!claimed) return;

  const source = await loadDeliverySource(deliveryId);
  if (!source) return;
  const attemptNumber = source.delivery.attemptCount + 1;
  let result;

  try {
    if (!source.integration.encryptedCredentials) {
      throw new Error("credential_missing");
    }
    if (!source.payment) throw new Error("payment_missing");
    const cfg = configOf(source.integration.config);
    const payload = buildUtmifyPayload(
      {
        reference: source.order.reference,
        status: source.order.status,
        paymentMethod: source.payment.method,
        platform: cfg.platform || "Infinity",
        totalCents: source.order.totalCents,
        gatewayFeeCents: source.payment.feeCents,
        netCents: source.payment.netCents,
        currency: source.order.currency,
        createdAt: source.order.createdAt,
        paidAt: source.order.paidAt,
        refundedAt: source.order.refundedAt,
        customer: {
          name:
            [source.customer?.firstName, source.customer?.lastName]
              .filter(Boolean)
              .join(" ") || "Cliente",
          email: source.customer?.email || "cliente@nao-informado.invalid",
          phone: source.customer?.phone || null,
          document: source.customer?.document || null,
          country: source.customer?.country || source.order.countryCode,
          ip: source.order.clientIp,
        },
        products: source.items.map((item) => ({
          id: item.sku || item.variantId || item.productId || item.id,
          name: item.productName,
          planId: item.variantId,
          planName: item.variantName,
          quantity: item.quantity,
          priceInCents: item.unitPriceCents,
        })),
        utm: (source.order.utm ?? {}) as Record<string, unknown>,
      },
      source.delivery.saleStatus as UtmifySaleStatus,
    );
    result = await postUtmifyOrder(
      decryptSecret(source.integration.encryptedCredentials),
      payload,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected";
    result = {
      ok: false,
      retryable: false,
      httpStatus: null,
      code: code === "credential_missing" ? "invalid_token" : "invalid_payload",
      message:
        code === "credential_missing"
          ? "Credencial ausente."
          : "Os dados do pedido não puderam ser convertidos para a UTMify.",
      durationMs: 0,
    } as const;
  }

  const reachedLimit = attemptNumber >= source.delivery.maxAttempts;
  const nextStatus = result.ok
    ? "success"
    : result.retryable && !reachedLimit
      ? "pending"
      : result.retryable
        ? "dead_letter"
        : "failed";
  const nextAttemptAt =
    nextStatus === "pending"
      ? new Date(Date.now() + retryDelayMs(attemptNumber))
      : now;

  await db.transaction(async (tx) => {
    await tx.insert(integrationDeliveryAttempts).values({
      workspaceId: source.delivery.workspaceId,
      integrationId: source.delivery.integrationId,
      deliveryId,
      attemptNumber,
      result: result.ok ? "success" : "error",
      httpStatus: result.httpStatus,
      errorCode: result.code,
      errorMessage: result.ok ? null : result.message,
      durationMs: result.durationMs,
    });
    await tx
      .update(integrationDeliveries)
      .set({
        status: nextStatus,
        attemptCount: attemptNumber,
        nextAttemptAt,
        lockToken: null,
        lockedAt: null,
        httpStatus: result.httpStatus,
        errorCode: result.code,
        errorMessage: result.ok ? null : result.message,
        durationMs: result.durationMs,
        sentAt: result.ok ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(integrationDeliveries.id, deliveryId),
          eq(integrationDeliveries.lockToken, lockToken),
        ),
      );
    await tx
      .update(integrations)
      .set({
        lastSyncAt: result.ok ? now : source.integration.lastSyncAt,
        lastEventAt: now,
        lastError: result.ok ? null : result.message,
        updatedAt: now,
      })
      .where(eq(integrations.id, source.integration.id));
  });
}

export async function processUtmifyOutbox(limit = MAX_BATCH): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const db = getDb();
  const now = new Date();
  await db
    .update(integrationDeliveries)
    .set({ status: "pending", lockToken: null, lockedAt: null, updatedAt: now })
    .where(
      and(
        eq(integrationDeliveries.status, "processing"),
        lte(integrationDeliveries.lockedAt, new Date(Date.now() - STALE_LOCK_MS)),
      ),
    );
  const due = await db
    .select({ id: integrationDeliveries.id })
    .from(integrationDeliveries)
    .where(
      and(
        eq(integrationDeliveries.status, "pending"),
        lte(integrationDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(integrationDeliveries.nextAttemptAt))
    .limit(Math.min(MAX_BATCH, Math.max(1, limit)));
  for (const row of due) await processUtmifyDelivery(row.id);
  return due.length;
}

export async function requeueUtmifyDelivery(
  workspaceId: string,
  deliveryId: string,
): Promise<boolean> {
  const db = getDb();
  const [updated] = await db
    .update(integrationDeliveries)
    .set({
      status: "pending",
      nextAttemptAt: new Date(),
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationDeliveries.id, deliveryId),
        eq(integrationDeliveries.workspaceId, workspaceId),
        inArray(integrationDeliveries.status, ["failed", "dead_letter"]),
      ),
    )
    .returning({ id: integrationDeliveries.id });
  if (updated) scheduleUtmifyDeliveries([updated.id]);
  return Boolean(updated);
}
