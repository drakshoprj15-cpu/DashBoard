import { createHmac, randomUUID } from "node:crypto";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { webhookDeliveries, webhookEndpoints } from "@/database/schema";
import { and, eq, sql } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";

const REQUEST_TIMEOUT_MS = 8000;

/** Assina o corpo no mesmo formato que já usamos para verificar webhooks recebidos (Broski). */
function signPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): string {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

async function attemptDelivery(
  url: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<{
  ok: boolean;
  httpStatus: number | null;
  responseBody: string | null;
  durationMs: number;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await res.text().catch(() => "");
    return {
      ok: res.ok,
      httpStatus: res.status,
      responseBody: body.slice(0, 2000),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      responseBody: error instanceof Error ? error.message : "Falha de rede",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Envia um evento para todos os endpoints ativos inscritos nele.
 *
 * Sem fila nem worker: o envio é síncrono, no momento em que o evento
 * acontece, com até uma retentativa imediata em caso de falha. Não há
 * reenvio automático posterior — depois da 2ª tentativa, a entrega fica
 * marcada como `failed` (ou `dead_letter` ao atingir o limite de tentativas
 * do endpoint) e só pode ser reenviada manualmente pela UI de teste.
 */
export async function dispatchWebhookEvent(
  workspaceId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const db = getDb();

  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.workspaceId, workspaceId),
        eq(webhookEndpoints.isActive, true),
        sql`${webhookEndpoints.events} @> ${JSON.stringify([eventType])}::jsonb`,
      ),
    );

  for (const endpoint of endpoints) {
    if (!endpoint.encryptedSecret) continue;

    let secret: string;
    try {
      secret = decryptSecret(endpoint.encryptedSecret);
    } catch {
      continue;
    }

    const rawBody = JSON.stringify({
      event: eventType,
      data: payload,
      sentAt: new Date().toISOString(),
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Infinity-Event": eventType,
      "Infinity-Signature": signPayload(secret, timestamp, rawBody),
    };

    let result = await attemptDelivery(endpoint.url, rawBody, headers);
    let attempts = 1;
    if (!result.ok) {
      result = await attemptDelivery(endpoint.url, rawBody, headers);
      attempts = 2;
    }

    // Sem worker de reenvio: depois da 2ª tentativa síncrona, a entrega vai
    // direto para dead_letter — não há fila para reprocessar mais tarde.
    const maxAttempts = 2;
    const status = result.ok
      ? "success"
      : attempts >= maxAttempts
        ? "dead_letter"
        : "failed";

    await db.insert(webhookDeliveries).values({
      workspaceId,
      endpointId: endpoint.id,
      eventType,
      idempotencyKey: randomUUID(),
      payload,
      status,
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      attempts,
      maxAttempts,
      durationMs: result.durationMs,
    });
  }
}
