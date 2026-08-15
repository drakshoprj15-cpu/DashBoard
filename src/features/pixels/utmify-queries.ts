import "server-only";

import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { integrationDeliveries, integrations, orders } from "@/database/schema";
import { requireCustomerPermission } from "@/features/customers/access";

interface SafeConfig { credentialName?: string; platform?: string; tokenPreview?: string }
const cfg = (value: unknown): SafeConfig => value && typeof value === "object" ? value as SafeConfig : {};

export interface UtmifyDeliveryFilters {
  order?: string;
  saleStatus?: string;
  result?: string;
  minAttempts?: number;
  from?: string;
  to?: string;
}

export async function getUtmifyPageData(filters: UtmifyDeliveryFilters = {}) {
  const empty = {
    integration: null,
    stats: { active: 0, generated24h: 0, approved24h: 0, pending: 0, errors: 0 },
    deliveries: [] as Array<Record<string, unknown>>,
  };
  if (!isDatabaseConfigured()) return empty;
  const { workspaceId } = await requireCustomerPermission("view");
  const db = getDb();
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, "utmify")))
    .limit(1);
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const conditions = [eq(integrationDeliveries.workspaceId, workspaceId)];
  if (filters.order) conditions.push(ilike(orders.reference, `%${filters.order.slice(0, 64)}%`));
  if (filters.saleStatus) conditions.push(eq(integrationDeliveries.saleStatus, filters.saleStatus));
  const deliveryStatuses = ["pending", "processing", "success", "failed", "dead_letter"] as const;
  const result = deliveryStatuses.find((status) => status === filters.result);
  if (result) conditions.push(eq(integrationDeliveries.status, result));
  if (filters.minAttempts) conditions.push(gte(integrationDeliveries.attemptCount, Math.min(100, filters.minAttempts)));
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (filters.from && datePattern.test(filters.from)) conditions.push(gte(integrationDeliveries.createdAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to && datePattern.test(filters.to)) conditions.push(sql`${integrationDeliveries.createdAt} < ${new Date(`${filters.to}T00:00:00Z`)} + interval '1 day'`);

  const [statsRows, deliveries] = await Promise.all([
    db
      .select({
        generated24h: sql<number>`count(*) filter (where ${integrationDeliveries.saleStatus} = 'waiting_payment' and ${integrationDeliveries.createdAt} >= ${since})::int`,
        approved24h: sql<number>`count(*) filter (where ${integrationDeliveries.saleStatus} = 'paid' and ${integrationDeliveries.createdAt} >= ${since})::int`,
        pending: sql<number>`count(*) filter (where ${integrationDeliveries.status} in ('pending','processing'))::int`,
        errors: sql<number>`count(*) filter (where ${integrationDeliveries.status} in ('failed','dead_letter'))::int`,
      })
      .from(integrationDeliveries)
      .where(eq(integrationDeliveries.workspaceId, workspaceId)),
    db
      .select({
        id: integrationDeliveries.id,
        orderReference: orders.reference,
        saleStatus: integrationDeliveries.saleStatus,
        status: integrationDeliveries.status,
        attemptCount: integrationDeliveries.attemptCount,
        httpStatus: integrationDeliveries.httpStatus,
        errorCode: integrationDeliveries.errorCode,
        errorMessage: integrationDeliveries.errorMessage,
        createdAt: integrationDeliveries.createdAt,
        sentAt: integrationDeliveries.sentAt,
      })
      .from(integrationDeliveries)
      .innerJoin(orders, eq(orders.id, integrationDeliveries.orderId))
      .where(and(...conditions))
      .orderBy(desc(integrationDeliveries.createdAt))
      .limit(50),
  ]);
  const c = cfg(row?.config);
  const totalSuccess = row
    ? await db.select({ count: sql<number>`count(*)::int` }).from(integrationDeliveries).where(and(eq(integrationDeliveries.integrationId, row.id), eq(integrationDeliveries.status, "success")))
    : [{ count: 0 }];
  return {
    integration: row ? {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      status: row.status,
      connectionStatus: row.connectionStatus,
      credentialName: c.credentialName || "",
      platform: c.platform || "Infinity",
      tokenPreview: c.tokenPreview || "••••••",
      lastConnectionTestAt: row.lastConnectionTestAt,
      lastConnectionMessage: row.lastConnectionMessage,
      lastSyncAt: row.lastSyncAt,
      totalSent: totalSuccess[0]?.count ?? 0,
    } : null,
    stats: {
      active: row?.isActive ? 1 : 0,
      generated24h: statsRows[0]?.generated24h ?? 0,
      approved24h: statsRows[0]?.approved24h ?? 0,
      pending: statsRows[0]?.pending ?? 0,
      errors: statsRows[0]?.errors ?? 0,
    },
    deliveries,
  };
}
