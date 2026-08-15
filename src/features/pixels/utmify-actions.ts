"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { integrationLogs, integrations } from "@/database/schema";
import { requireCustomerPermission } from "@/features/customers/access";
import { encryptSecret, maskTokenPreview, decryptSecret } from "@/lib/crypto";
import {
  buildUtmifyPayload,
  isPascalCasePlatform,
  postUtmifyOrder,
} from "@/features/pixels/utmify-core";
import { requeueUtmifyDelivery } from "@/features/pixels/utmify";

export interface UtmifyActionState {
  ok: boolean;
  message: string;
  code?: string;
}

function text(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function safeConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function saveUtmifyIntegrationAction(
  _previous: UtmifyActionState | null,
  formData: FormData,
): Promise<UtmifyActionState> {
  if (!isDatabaseConfigured()) return { ok: false, message: "Banco de dados não configurado." };
  const { workspaceId } = await requireCustomerPermission("edit");
  const name = text(formData, "name", 80);
  const credentialName = text(formData, "credentialName", 80);
  const platform = text(formData, "platform", 50);
  const token = text(formData, "token", 4096);
  const active = formData.get("isActive") === "on";
  if (name.length < 2 || credentialName.length < 2) {
    return { ok: false, message: "Informe o nome interno e o nome da credencial." };
  }
  if (!isPascalCasePlatform(platform)) {
    return { ok: false, message: "A plataforma deve usar PascalCase, por exemplo Infinity." };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, "utmify")))
    .limit(1);
  if (!existing && !token) return { ok: false, message: "Informe o token x-api-token." };

  const oldConfig = safeConfig(existing?.config);
  const credentialFields = token
    ? {
        encryptedCredentials: encryptSecret(token),
        config: { credentialName, platform, tokenPreview: maskTokenPreview(token) },
      }
    : {
        config: {
          ...oldConfig,
          credentialName,
          platform,
        },
      };
  const now = new Date();
  if (existing) {
    await db
      .update(integrations)
      .set({
        name,
        isActive: active,
        status: active && existing.lastConnectionOk ? "connected" : active ? "disconnected" : "disabled",
        ...credentialFields,
        updatedAt: now,
      })
      .where(and(eq(integrations.id, existing.id), eq(integrations.workspaceId, workspaceId)));
  } else {
    await db.insert(integrations).values({
      workspaceId,
      key: "utmify",
      name,
      category: "analytics",
      status: active ? "disconnected" : "disabled",
      isActive: active,
      ...credentialFields,
    });
  }
  revalidatePath("/pixel");
  return { ok: true, message: active ? "Integração salva. Teste a credencial para iniciar os envios." : "Integração salva como inativa." };
}

export async function testUtmifyConnectionAction(
  _previous: UtmifyActionState | null,
  formData: FormData,
): Promise<UtmifyActionState> {
  if (!isDatabaseConfigured()) return { ok: false, message: "Banco de dados não configurado." };
  const { workspaceId } = await requireCustomerPermission("edit");
  const db = getDb();
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, "utmify")))
    .limit(1);
  const recent = await db
    .select({ id: integrationLogs.id })
    .from(integrationLogs)
    .where(
      and(
        eq(integrationLogs.workspaceId, workspaceId),
        eq(integrationLogs.integrationKey, "utmify"),
        eq(integrationLogs.action, "connection_test"),
        gte(integrationLogs.createdAt, new Date(Date.now() - 15_000)),
      ),
    )
    .orderBy(desc(integrationLogs.createdAt))
    .limit(1);
  if (recent.length) return { ok: false, code: "rate_limited", message: "Aguarde alguns segundos antes de testar novamente." };

  const tokenInput = text(formData, "token", 4096);
  const platformInput = text(formData, "platform", 50);
  const cfg = safeConfig(integration?.config);
  const platform = platformInput || String(cfg.platform || "Infinity");
  const token = tokenInput || (integration?.encryptedCredentials ? decryptSecret(integration.encryptedCredentials) : "");
  if (!token) return { ok: false, code: "invalid_token", message: "Informe ou salve o token antes de testar." };
  if (!isPascalCasePlatform(platform)) return { ok: false, code: "invalid_payload", message: "A plataforma deve usar PascalCase." };

  const payload = buildUtmifyPayload(
    {
      reference: `TEST-${Date.now()}`,
      status: "awaiting_payment",
      paymentMethod: "pix",
      platform,
      totalCents: 100,
      gatewayFeeCents: 0,
      netCents: 100,
      currency: "BRL",
      createdAt: new Date(),
      paidAt: null,
      refundedAt: null,
      customer: { name: "Teste de conexão", email: "teste@infinity.invalid", phone: null, document: null, country: "BR", ip: null },
      products: [{ id: "connection-test", name: "Teste de conexão", planId: null, planName: null, quantity: 1, priceInCents: 100 }],
      utm: {},
    },
    "waiting_payment",
    true,
  );
  const result = await postUtmifyOrder(token, payload);
  const testedAt = new Date();
  const connectionStatus = result.ok ? "valid" : result.code || "unexpected";
  if (integration) {
    await db
      .update(integrations)
      .set({
        connectionStatus,
        lastConnectionTestAt: testedAt,
        lastConnectionOk: result.ok,
        lastConnectionHttpStatus: result.httpStatus,
        lastConnectionMessage: result.message,
        lastConnectionDurationMs: result.durationMs,
        status: result.ok && integration.isActive ? "connected" : result.ok ? "disabled" : "error",
        lastError: result.ok ? null : result.message,
        updatedAt: testedAt,
      })
      .where(and(eq(integrations.id, integration.id), eq(integrations.workspaceId, workspaceId)));
  }
  await db.insert(integrationLogs).values({
    workspaceId,
    integrationId: integration?.id,
    integrationKey: "utmify",
    level: result.ok ? "info" : "error",
    action: "connection_test",
    message: result.message,
    data: { result: connectionStatus, httpStatus: result.httpStatus },
    durationMs: result.durationMs,
  });
  revalidatePath("/pixel");
  return { ok: result.ok, code: connectionStatus, message: result.message };
}

export async function toggleUtmifyIntegrationAction(formData: FormData): Promise<void> {
  const { workspaceId } = await requireCustomerPermission("edit");
  const active = formData.get("active") === "true";
  await getDb()
    .update(integrations)
    .set({ isActive: active, status: active ? "connected" : "disabled", updatedAt: new Date() })
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, "utmify")));
  revalidatePath("/pixel");
}

export async function deleteUtmifyIntegrationAction(): Promise<void> {
  const { workspaceId } = await requireCustomerPermission("delete");
  await getDb().delete(integrations).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, "utmify")));
  revalidatePath("/pixel");
}

export async function requeueUtmifyDeliveryAction(formData: FormData): Promise<void> {
  const { workspaceId } = await requireCustomerPermission("edit");
  await requeueUtmifyDelivery(workspaceId, text(formData, "id", 64));
  revalidatePath("/pixel");
}
