"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { landingPages, pixelEvents, pixels, workspaces } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { encryptSecret, maskTokenPreview } from "@/lib/crypto";
import { pixelSchema, ID_PATTERNS } from "@/validations/pixel";
import { withTrackingDefaults } from "@/features/landing-pages/defaults";
import {
  reprocessPurchaseEvent,
  testMetaConnection,
} from "@/features/pixels/meta-capi";
import type { PixelConnectionStatus } from "@/features/pixels/types";

export interface PixelActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function savePixelAction(
  _prev: PixelActionResult | null,
  formData: FormData,
): Promise<PixelActionResult> {
  const parsed = pixelSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    pixelId: formData.get("pixelId"),
    token: formData.get("token") ?? "",
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "Banco de dados não configurado — não é possível salvar o pixel.",
    };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const data = parsed.data;

    await db.insert(pixels).values({
      workspaceId,
      name: data.name,
      type: data.type,
      pixelId: data.pixelId,
      encryptedToken: data.token ? encryptSecret(data.token) : null,
      tokenPreview: data.token ? maskTokenPreview(data.token) : null,
      isActive: data.isActive ?? true,
      enabledEvents: [
        "PageView",
        "ViewContent",
        "InitiateCheckout",
        "Purchase",
      ],
    });

    revalidatePath("/pixel");
    return { ok: true, message: "Pixel salvo e ativo nas suas páginas." };
  } catch (error) {
    console.error("[pixel] erro ao salvar:", error);
    return { ok: false, error: "Não foi possível salvar o pixel." };
  }
}

export async function togglePixelAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(pixels)
    .set({ isActive: next, updatedAt: new Date() })
    .where(and(eq(pixels.id, id), eq(pixels.workspaceId, workspaceId)));

  revalidatePath("/pixel");
}

export async function deletePixelAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(pixels)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(pixels.id, id), eq(pixels.workspaceId, workspaceId)));

  revalidatePath("/pixel");
}

// ---------------------------------------------------------------------------
// Aba Meta — pixels por landing page
// ---------------------------------------------------------------------------

export interface LandingPagePixelInput {
  /** presente = editar pixel existente; ausente = criar */
  id?: string;
  type: "meta_pixel" | "meta_capi";
  pixelId: string;
  /** vazio, ou igual à prévia mascarada devolvida antes = manter token atual */
  token?: string;
  testEventCode?: string;
  isActive: boolean;
}

/**
 * Salva de uma vez todos os pixels Meta de uma landing page (dentro de uma
 * transação — nunca um salvamento parcial). A landing page é revalidada
 * contra o workspace resolvido no servidor; `landingPageId` nunca é
 * confiado apenas porque veio do cliente.
 */
export async function saveLandingPagePixelsAction(
  landingPageId: string,
  rows: LandingPagePixelInput[],
): Promise<PixelActionResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [lp] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, landingPageId),
        eq(landingPages.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!lp) return { ok: false, error: "Landing page não encontrada." };

  const existingRows = await db
    .select({
      id: pixels.id,
      type: pixels.type,
      pixelId: pixels.pixelId,
      tokenPreview: pixels.tokenPreview,
    })
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        eq(pixels.landingPageId, landingPageId),
        isNull(pixels.deletedAt),
      ),
    );
  const existingById = new Map(existingRows.map((r) => [r.id, r]));
  const submittedIds = new Set(
    rows.filter((r) => r.id).map((r) => r.id as string),
  );

  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pixelId = row.pixelId?.trim() ?? "";
    if (!pixelId) {
      return { ok: false, error: `Linha ${i + 1}: informe o ID do pixel.` };
    }

    const pattern = ID_PATTERNS[row.type];
    if (pattern && !pattern.regex.test(pixelId)) {
      return { ok: false, error: `Linha ${i + 1}: ${pattern.message}.` };
    }

    const key = `${row.type}:${pixelId}`;
    if (seen.has(key)) {
      return {
        ok: false,
        error: `Linha ${i + 1}: este Pixel ID já foi usado em outra linha.`,
      };
    }
    seen.add(key);

    const collidesWithUntouched = existingRows.some(
      (e) =>
        !submittedIds.has(e.id) && e.type === row.type && e.pixelId === pixelId,
    );
    if (collidesWithUntouched) {
      return {
        ok: false,
        error: `Linha ${i + 1}: já existe um pixel com este ID nesta landing page.`,
      };
    }

    if (row.type === "meta_capi") {
      const existing = row.id ? existingById.get(row.id) : undefined;
      const hasToken = Boolean(row.token) || Boolean(existing?.tokenPreview);
      if (!hasToken) {
        return {
          ok: false,
          error: `Linha ${i + 1}: a API de Conversões exige o token de acesso.`,
        };
      }
    }
  }

  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const pixelId = row.pixelId.trim();
        const existing = row.id ? existingById.get(row.id) : undefined;
        // Se o token enviado é igual à prévia mascarada, o usuário não
        // digitou um valor novo — mantém o token atual sem recriptografar.
        const isMaskedUnchanged =
          Boolean(existing) && row.token === existing?.tokenPreview;
        const shouldReencrypt = Boolean(row.token) && !isMaskedUnchanged;
        const tokenFields = shouldReencrypt
          ? {
              encryptedToken: encryptSecret(row.token!),
              tokenPreview: maskTokenPreview(row.token!),
            }
          : {};

        if (row.id) {
          await tx
            .update(pixels)
            .set({
              pixelId,
              testEventCode: row.testEventCode?.trim() || null,
              isActive: row.isActive,
              ...tokenFields,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(pixels.id, row.id),
                eq(pixels.workspaceId, workspaceId),
                eq(pixels.landingPageId, landingPageId),
              ),
            );
        } else {
          await tx.insert(pixels).values({
            workspaceId,
            landingPageId,
            name:
              row.type === "meta_capi"
                ? `Meta Conversions API — ${pixelId}`
                : `Meta Pixel — ${pixelId}`,
            type: row.type,
            pixelId,
            testEventCode: row.testEventCode?.trim() || null,
            isActive: row.isActive,
            enabledEvents: [
              "PageView",
              "ViewContent",
              "InitiateCheckout",
              "Purchase",
            ],
            ...(row.token
              ? {
                  encryptedToken: encryptSecret(row.token),
                  tokenPreview: maskTokenPreview(row.token),
                }
              : {}),
          });
        }
      }
    });

    revalidatePath("/pixel");
    return { ok: true, message: "Pixels da landing page salvos." };
  } catch (error) {
    console.error("[pixel] erro ao salvar pixels da landing page:", error);
    return {
      ok: false,
      error: "Não foi possível salvar os pixels desta landing page.",
    };
  }
}

/**
 * Liga/desliga "contar pedidos gerados como compra" — global (workspace,
 * `landingPageId` nulo) ou específico de uma landing page (revalidada
 * contra o workspace atual antes de gravar).
 */
export async function updatePurchaseRuleAction(
  landingPageId: string | null,
  value: boolean,
): Promise<PixelActionResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  try {
    if (!landingPageId) {
      const [row] = await db
        .select({ settings: workspaces.settings })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      const settings = (row?.settings ?? {}) as Record<string, unknown>;

      await db
        .update(workspaces)
        .set({
          settings: { ...settings, countGeneratedOrdersAsPurchase: value },
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));
    } else {
      const [lp] = await db
        .select({ id: landingPages.id, tracking: landingPages.tracking })
        .from(landingPages)
        .where(
          and(
            eq(landingPages.id, landingPageId),
            eq(landingPages.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!lp) return { ok: false, error: "Landing page não encontrada." };

      const tracking = withTrackingDefaults(lp.tracking);
      await db
        .update(landingPages)
        .set({
          tracking: { ...tracking, countGeneratedOrdersAsPurchase: value },
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, landingPageId));
    }

    revalidatePath("/pixel");
    return { ok: true };
  } catch (error) {
    console.error("[pixel] erro ao salvar regra de Purchase:", error);
    return { ok: false, error: "Não foi possível salvar a configuração." };
  }
}

export interface TestConnectionActionResult extends PixelActionResult {
  status?: PixelConnectionStatus;
}

/** Testa a conexão de um pixel salvo — nunca envia um Purchase de produção. */
export async function testPixelConnectionAction(
  pixelRowId: string,
): Promise<TestConnectionActionResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [pixel] = await db
    .select()
    .from(pixels)
    .where(and(eq(pixels.id, pixelRowId), eq(pixels.workspaceId, workspaceId)))
    .limit(1);

  if (!pixel) return { ok: false, error: "Pixel não encontrado." };
  if (!pixel.pixelId) {
    return { ok: false, error: "Informe o ID do pixel antes de testar." };
  }
  if (!pixel.encryptedToken) {
    return {
      ok: false,
      error: "Salve um token da API de Conversões antes de testar.",
    };
  }

  const result = await testMetaConnection(
    pixel.pixelId,
    pixel.encryptedToken,
    pixel.testEventCode,
  );

  await db
    .update(pixels)
    .set({
      connectionStatus: result.status,
      lastTestedAt: new Date(),
      lastTestError: result.ok ? null : result.message,
    })
    .where(eq(pixels.id, pixelRowId));

  revalidatePath("/pixel");
  return { ok: result.ok, message: result.message, status: result.status };
}

/**
 * Reprocessa um evento com falha (botão "Reprocessar" do log de eventos —
 * `<form action={reprocessPixelEventAction}>`, mesmo padrão de
 * `togglePixelAction`/`deletePixelAction`).
 */
export async function reprocessPixelEventAction(
  formData: FormData,
): Promise<void> {
  const eventRowId = String(formData.get("id") ?? "");
  if (!eventRowId || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [event] = await db
    .select({ id: pixelEvents.id, status: pixelEvents.status })
    .from(pixelEvents)
    .where(
      and(
        eq(pixelEvents.id, eventRowId),
        eq(pixelEvents.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!event || event.status !== "failed") return;

  try {
    await reprocessPurchaseEvent(eventRowId);
  } catch (error) {
    console.error("[pixel] erro ao reprocessar evento:", error);
  }

  revalidatePath("/pixel");
}
