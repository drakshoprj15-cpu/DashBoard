import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { auditLogs, paymentWebhooks } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { resolvePeriodRange, type DashboardPeriod } from "@/features/dashboard/period";

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: Record<string, unknown>;
  createdAt: Date;
}

export interface ReceivedWebhookRow {
  id: string;
  providerKey: string;
  eventType: string;
  signatureValid: boolean | null;
  processedAt: Date | null;
  processingError: string | null;
  createdAt: Date;
}

/** Ações administrativas registadas no período, mais recentes primeiro. */
export async function listAuditLogs(period: DashboardPeriod, limit = 200): Promise<AuditLogRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const range = resolvePeriodRange(period);

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      changes: auditLogs.changes,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        gte(auditLogs.createdAt, range.start),
        lt(auditLogs.createdAt, range.end),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    changes: (r.changes as Record<string, unknown>) ?? {},
  }));
}

/** Webhooks recebidos do gateway no período, mais recentes primeiro. */
export async function listReceivedWebhooks(
  period: DashboardPeriod,
  limit = 200,
): Promise<ReceivedWebhookRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const range = resolvePeriodRange(period);

  const rows = await db
    .select({
      id: paymentWebhooks.id,
      providerKey: paymentWebhooks.providerKey,
      eventType: paymentWebhooks.eventType,
      signatureValid: paymentWebhooks.signatureValid,
      processedAt: paymentWebhooks.processedAt,
      processingError: paymentWebhooks.processingError,
      createdAt: paymentWebhooks.createdAt,
    })
    .from(paymentWebhooks)
    .where(
      and(
        eq(paymentWebhooks.workspaceId, workspaceId),
        gte(paymentWebhooks.createdAt, range.start),
        lt(paymentWebhooks.createdAt, range.end),
      ),
    )
    .orderBy(desc(paymentWebhooks.createdAt))
    .limit(limit);

  return rows;
}

export interface AuditSummary {
  adminActionsCount: number;
  webhooksCount: number;
  webhookErrorsCount: number;
}

export async function getAuditSummary(period: DashboardPeriod): Promise<AuditSummary> {
  if (!isDatabaseConfigured()) {
    return { adminActionsCount: 0, webhooksCount: 0, webhookErrorsCount: 0 };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const range = resolvePeriodRange(period);

  const [adminRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        gte(auditLogs.createdAt, range.start),
        lt(auditLogs.createdAt, range.end),
      ),
    );

  const [webhookRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${paymentWebhooks.processingError} is not null or ${paymentWebhooks.signatureValid} = false)::int`,
    })
    .from(paymentWebhooks)
    .where(
      and(
        eq(paymentWebhooks.workspaceId, workspaceId),
        gte(paymentWebhooks.createdAt, range.start),
        lt(paymentWebhooks.createdAt, range.end),
      ),
    );

  return {
    adminActionsCount: adminRow?.n ?? 0,
    webhooksCount: webhookRow?.total ?? 0,
    webhookErrorsCount: webhookRow?.errors ?? 0,
  };
}
