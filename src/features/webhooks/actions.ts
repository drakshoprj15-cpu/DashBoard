"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { webhookDeliveries, webhookEndpoints } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { recordAuditLog } from "@/features/audit/log";
import { eventLabel } from "@/features/webhooks/events-catalog";
import {
  createWebhookEndpointSchema,
  sendTestWebhookSchema,
  updateWebhookEndpointSchema,
} from "@/validations/webhook";

export interface WebhookActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface TestWebhookResult extends WebhookActionResult {
  httpStatus?: number | null;
  responseBody?: string | null;
  durationMs?: number;
  requestBody?: string;
}

function newSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export async function createWebhookEndpointAction(
  _prev: WebhookActionResult | null,
  formData: FormData,
): Promise<WebhookActionResult> {
  const parsed = createWebhookEndpointSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    events: formData.getAll("events"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const d = parsed.data;

    const [created] = await db
      .insert(webhookEndpoints)
      .values({
        workspaceId,
        name: d.name,
        url: d.url,
        encryptedSecret: encryptSecret(newSecret()),
        events: d.events,
        isActive: d.isActive,
      })
      .returning({ id: webhookEndpoints.id });

    await recordAuditLog({
      action: "webhook.created",
      entityType: "webhook_endpoint",
      entityId: created.id,
      changes: { name: d.name, url: d.url, events: d.events },
    });

    revalidatePath("/webhooks");
    return { ok: true, message: "Webhook criado." };
  } catch (error) {
    console.error("[webhooks] erro ao criar:", error);
    return { ok: false, error: "Não foi possível criar o webhook." };
  }
}

export async function updateWebhookEndpointAction(
  _prev: WebhookActionResult | null,
  formData: FormData,
): Promise<WebhookActionResult> {
  const parsed = updateWebhookEndpointSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    url: formData.get("url"),
    events: formData.getAll("events"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const { id, ...d } = parsed.data;

    const [row] = await db
      .update(webhookEndpoints)
      .set({
        name: d.name,
        url: d.url,
        events: d.events,
        isActive: d.isActive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.workspaceId, workspaceId),
        ),
      )
      .returning({ id: webhookEndpoints.id });

    if (!row) return { ok: false, error: "Webhook não encontrado." };

    await recordAuditLog({
      action: "webhook.updated",
      entityType: "webhook_endpoint",
      entityId: id,
      changes: { name: d.name, url: d.url, events: d.events },
    });

    revalidatePath("/webhooks");
    return { ok: true, message: "Webhook atualizado." };
  } catch (error) {
    console.error("[webhooks] erro ao atualizar:", error);
    return { ok: false, error: "Não foi possível atualizar o webhook." };
  }
}

export async function regenerateWebhookSecretAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(webhookEndpoints)
    .set({ encryptedSecret: encryptSecret(newSecret()), updatedAt: new Date() })
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.workspaceId, workspaceId),
      ),
    );

  await recordAuditLog({
    action: "webhook.secret_regenerated",
    entityType: "webhook_endpoint",
    entityId: id,
  });

  revalidatePath("/webhooks");
}

export async function toggleWebhookEndpointAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const activate = formData.get("activate") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .update(webhookEndpoints)
    .set({ isActive: activate, updatedAt: new Date() })
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.workspaceId, workspaceId),
      ),
    )
    .returning({ name: webhookEndpoints.name });

  if (row) {
    await recordAuditLog({
      action: activate ? "webhook.activated" : "webhook.deactivated",
      entityType: "webhook_endpoint",
      entityId: id,
      changes: { name: row.name },
    });
  }

  revalidatePath("/webhooks");
}

export async function duplicateWebhookEndpointAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [original] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!original) return;

  const [created] = await db
    .insert(webhookEndpoints)
    .values({
      workspaceId,
      name: `${original.name} (cópia)`,
      url: original.url,
      encryptedSecret: encryptSecret(newSecret()),
      events: original.events,
      isActive: false,
    })
    .returning({ id: webhookEndpoints.id });

  await recordAuditLog({
    action: "webhook.duplicated",
    entityType: "webhook_endpoint",
    entityId: created.id,
    changes: { fromEndpointId: id },
  });

  revalidatePath("/webhooks");
}

export async function deleteWebhookEndpointAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .delete(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.workspaceId, workspaceId),
      ),
    )
    .returning({ name: webhookEndpoints.name });

  if (row) {
    await recordAuditLog({
      action: "webhook.deleted",
      entityType: "webhook_endpoint",
      entityId: id,
      changes: { name: row.name },
    });
  }

  revalidatePath("/webhooks");
}

/** Dispara um evento de exemplo para o endpoint, de verdade, e grava o resultado. */
export async function sendTestWebhookAction(
  _prev: TestWebhookResult | null,
  formData: FormData,
): Promise<TestWebhookResult> {
  const parsed = sendTestWebhookSchema.safeParse({
    id: formData.get("id"),
    event: formData.get("event"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const { id, event } = parsed.data;

    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!endpoint) return { ok: false, error: "Webhook não encontrado." };
    if (!endpoint.encryptedSecret) {
      return {
        ok: false,
        error: "Este webhook não tem um segredo configurado.",
      };
    }

    const { createHmac } = await import("node:crypto");
    const secret = decryptSecret(endpoint.encryptedSecret);
    const requestBody = JSON.stringify({
      event,
      data: { test: true, message: `Evento de teste — ${eventLabel(event)}` },
      sentAt: new Date().toISOString(),
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${requestBody}`)
      .digest("hex");

    const start = Date.now();
    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let ok = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Infinity-Event": event,
          "Infinity-Signature": `t=${timestamp},v1=${signature}`,
        },
        body: requestBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      httpStatus = res.status;
      responseBody = (await res.text().catch(() => "")).slice(0, 2000);
      ok = res.ok;
    } catch (error) {
      responseBody = error instanceof Error ? error.message : "Falha de rede";
    }

    const durationMs = Date.now() - start;

    await db.insert(webhookDeliveries).values({
      workspaceId,
      endpointId: endpoint.id,
      eventType: "webhook.test",
      idempotencyKey: randomUUID(),
      payload: { originalEvent: event },
      status: ok ? "success" : "failed",
      httpStatus,
      responseBody,
      attempts: 1,
      maxAttempts: 1,
      durationMs,
    });

    await recordAuditLog({
      action: "webhook.tested",
      entityType: "webhook_endpoint",
      entityId: id,
      changes: { event, ok, httpStatus: httpStatus ?? undefined },
    });

    return {
      ok,
      message: ok ? "Teste enviado com sucesso." : undefined,
      error: ok ? undefined : "O destino não respondeu com sucesso.",
      httpStatus,
      responseBody,
      durationMs,
      requestBody,
    };
  } catch (error) {
    console.error("[webhooks] erro ao testar:", error);
    return { ok: false, error: "Não foi possível enviar o teste." };
  }
}
