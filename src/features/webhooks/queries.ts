import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { webhookDeliveries, webhookEndpoints } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { decryptSecret } from "@/lib/crypto";

export interface WebhookEndpointRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  deliveriesCount: number;
  successCount: number;
  failureCount: number;
  lastDeliveryAt: Date | null;
  createdAt: Date;
}

/** Endpoints do workspace com estatísticas agregadas de entrega. */
export async function listWebhookEndpoints(): Promise<WebhookEndpointRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: webhookEndpoints.id,
      name: webhookEndpoints.name,
      url: webhookEndpoints.url,
      events: webhookEndpoints.events,
      isActive: webhookEndpoints.isActive,
      createdAt: webhookEndpoints.createdAt,
      deliveriesCount: sql<number>`count(${webhookDeliveries.id})::int`,
      successCount: sql<number>`count(${webhookDeliveries.id}) filter (where ${webhookDeliveries.status} = 'success')::int`,
      failureCount: sql<number>`count(${webhookDeliveries.id}) filter (where ${webhookDeliveries.status} in ('failed','dead_letter'))::int`,
      lastDeliveryAt: sql<Date | null>`max(${webhookDeliveries.createdAt})`,
    })
    .from(webhookEndpoints)
    .leftJoin(
      webhookDeliveries,
      eq(webhookDeliveries.endpointId, webhookEndpoints.id),
    )
    .where(eq(webhookEndpoints.workspaceId, workspaceId))
    .groupBy(
      webhookEndpoints.id,
      webhookEndpoints.name,
      webhookEndpoints.url,
      webhookEndpoints.events,
      webhookEndpoints.isActive,
      webhookEndpoints.createdAt,
    )
    .orderBy(desc(webhookEndpoints.createdAt));

  return rows.map((r) => ({
    ...r,
    events: Array.isArray(r.events) ? (r.events as string[]) : [],
  }));
}

export interface WebhookEndpointDetail extends WebhookEndpointRow {
  secret: string | null;
}

/** Endpoint completo, incluindo o secret descriptografado (só sob ação explícita). */
export async function getWebhookEndpointDetail(
  id: string,
): Promise<WebhookEndpointDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) return null;

  let secret: string | null = null;
  if (row.encryptedSecret) {
    try {
      secret = decryptSecret(row.encryptedSecret);
    } catch {
      secret = null;
    }
  }

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: Array.isArray(row.events) ? (row.events as string[]) : [],
    isActive: row.isActive,
    deliveriesCount: 0,
    successCount: 0,
    failureCount: 0,
    lastDeliveryAt: null,
    createdAt: row.createdAt,
    secret,
  };
}

export interface WebhookDeliveryRow {
  id: string;
  eventType: string;
  status: string;
  httpStatus: number | null;
  responseBody: string | null;
  attempts: number;
  durationMs: number | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** Histórico de entregas de um endpoint, mais recentes primeiro. */
export async function listWebhookDeliveries(
  endpointId: string,
  limit = 50,
): Promise<WebhookDeliveryRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: webhookDeliveries.id,
      eventType: webhookDeliveries.eventType,
      status: webhookDeliveries.status,
      httpStatus: webhookDeliveries.httpStatus,
      responseBody: webhookDeliveries.responseBody,
      attempts: webhookDeliveries.attempts,
      durationMs: webhookDeliveries.durationMs,
      payload: webhookDeliveries.payload,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.workspaceId, workspaceId),
        eq(webhookDeliveries.endpointId, endpointId),
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    payload: (r.payload as Record<string, unknown>) ?? {},
  }));
}
