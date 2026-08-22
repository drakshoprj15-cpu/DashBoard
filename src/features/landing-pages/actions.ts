"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { landingPages, landingPageVersions } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/features/audit/log";
import {
  createLandingPageSchema,
  publishSchema,
  saveDraftSchema,
  updateSettingsSchema,
} from "@/validations/landing-page";

import {
  DEFAULT_CUSTOM_CODE,
  DEFAULT_SEO,
  DEFAULT_THEME,
  DEFAULT_TRACKING,
  withContentDefaults,
  withCustomCodeDefaults,
  withSeoDefaults,
  withThemeDefaults,
  withTrackingDefaults,
} from "./defaults";
import { buildTemplateBlocks } from "./templates";
import { loadProductData } from "./product-data";
import { sanitizeCss, guardScript, slugifyLanding } from "./sanitize";
import { validateForPublish } from "./publish-rules";
import type { LandingSnapshot } from "./types";

export interface LandingActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** Id da página criada/duplicada, para o cliente navegar até ao editor */
  id?: string;
  slug?: string;
}

const NO_DB: LandingActionResult = {
  ok: false,
  error: "Banco de dados não configurado. Ligue o Supabase para criar páginas.",
};

/**
 * Toda ação começa por aqui: sem sessão válida, nada é escrito. O workspace
 * resolvido é o filtro de propriedade — nenhuma consulta abaixo toca numa
 * linha de outro workspace.
 */
async function requireWorkspace(): Promise<{
  workspaceId: string;
  userId: string | null;
} | null> {
  const session = await getSession();
  if (!session) return null;
  const workspaceId = await getOrCreateDefaultWorkspace();
  return {
    workspaceId,
    userId: session.demoMode ? null : session.user.id,
  };
}

/** O slug está livre neste workspace? */
async function isSlugAvailable(
  workspaceId: string,
  slug: string,
  ignoreId?: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.workspaceId, workspaceId),
        eq(landingPages.slug, slug),
        isNull(landingPages.deletedAt),
        ignoreId ? ne(landingPages.id, ignoreId) : undefined,
      ),
    )
    .limit(1);

  return rows.length === 0;
}

function revalidateLanding(slug?: string) {
  revalidatePath("/landing-pages");
  if (slug) revalidatePath(`/lp/${slug}`);
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export async function createLandingPageAction(
  _prev: LandingActionResult | null,
  formData: FormData,
): Promise<LandingActionResult> {
  const rawName = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();

  const parsed = createLandingPageSchema.safeParse({
    name: rawName,
    publicName: formData.get("publicName") ?? "",
    slug: rawSlug ? slugifyLanding(rawSlug) : slugifyLanding(rawName),
    productId: formData.get("productId") ?? "",
    template: formData.get("template") ?? "produto-alta-conversao",
    language: formData.get("language") ?? "pt-PT",
    country: formData.get("country") ?? "PT",
    currency: formData.get("currency") ?? "EUR",
    logoUrl: formData.get("logoUrl") ?? "",
    faviconUrl: formData.get("faviconUrl") ?? "",
    productSync: formData.get("productSync") !== "off",
    theme: readThemeOverrides(formData),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context)
    return { ok: false, error: "Sessão expirada. Entre novamente." };

  const data = parsed.data;

  try {
    const db = getDb();

    if (!(await isSlugAvailable(context.workspaceId, data.slug))) {
      return {
        ok: false,
        error: `Já existe uma página no endereço "${data.slug}". Escolha outro.`,
      };
    }

    const productId = data.productId || null;
    const productData = productId
      ? await loadProductData(productId, context.workspaceId)
      : null;

    if (productId && !productData) {
      return { ok: false, error: "Produto não encontrado neste workspace." };
    }

    const [created] = await db
      .insert(landingPages)
      .values({
        workspaceId: context.workspaceId,
        name: data.name,
        publicName: data.publicName || data.name,
        slug: data.slug,
        status: "draft",
        template: data.template,
        content: { blocks: buildTemplateBlocks(data.template) },
        theme: { ...DEFAULT_THEME, ...(data.theme ?? {}) },
        seo: {
          ...DEFAULT_SEO,
          title: productData?.name ?? data.publicName ?? data.name,
          description: productData?.shortDescription ?? "",
        },
        tracking: DEFAULT_TRACKING,
        customCode: DEFAULT_CUSTOM_CODE,
        productId,
        productSnapshot: productData,
        productSync: data.productSync,
        logoUrl: data.logoUrl || null,
        faviconUrl: data.faviconUrl || null,
        language: data.language,
        country: data.country,
        currency: productData?.currency ?? data.currency,
        draftVersion: 1,
        previewToken: randomUUID(),
      })
      .returning({ id: landingPages.id, slug: landingPages.slug });

    await recordAuditLog({
      action: "landing_page.created",
      entityType: "landing_page",
      entityId: created.id,
      changes: { name: data.name, slug: created.slug, template: data.template },
    });

    revalidateLanding(created.slug);
    return {
      ok: true,
      id: created.id,
      slug: created.slug,
      message: "Landing page criada. Abra o editor para montar a página.",
    };
  } catch (error) {
    console.error("[landing-pages] erro ao criar:", error);
    return { ok: false, error: "Não foi possível criar a landing page." };
  }
}

/** Cores escolhidas no passo "Tema rápido" do assistente de criação. */
function readThemeOverrides(formData: FormData) {
  const keys = [
    "primaryColor",
    "buttonColor",
    "buttonTextColor",
    "headerBackground",
    "headerTextColor",
    "footerBackground",
    "footerTextColor",
    "backgroundColor",
    "textColor",
    "variantSelectedColor",
  ] as const;

  const overrides: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim())
      overrides[key] = value.trim();
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

// ---------------------------------------------------------------------------
// Rascunho
// ---------------------------------------------------------------------------

/**
 * Autosave do editor. Recebe JSON já montado no cliente (é grande demais
 * para `FormData`) e grava apenas as partes enviadas.
 */
export async function saveLandingDraftAction(
  input: unknown,
): Promise<LandingActionResult> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context)
    return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { id, content, theme, seo, tracking, customCode } = parsed.data;

  try {
    const db = getDb();

    const [row] = await db
      .update(landingPages)
      .set({
        ...(content ? { content } : {}),
        ...(theme ? { theme } : {}),
        ...(seo ? { seo } : {}),
        ...(tracking ? { tracking } : {}),
        ...(customCode
          ? {
              customCode: {
                ...customCode,
                css: sanitizeCss(customCode.css),
                javascript: guardScript(customCode.javascript),
              },
            }
          : {}),
        draftVersion: sql`${landingPages.draftVersion} + 1`,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(landingPages.id, id),
          eq(landingPages.workspaceId, context.workspaceId),
          isNull(landingPages.deletedAt),
        ),
      )
      .returning({ slug: landingPages.slug });

    if (!row) return { ok: false, error: "Página não encontrada." };

    revalidatePath("/landing-pages");
    return { ok: true, message: "Salvo" };
  } catch (error) {
    console.error("[landing-pages] erro ao salvar rascunho:", error);
    return { ok: false, error: "Não foi possível salvar." };
  }
}

/** Informações da aba Produto e dos dados gerais. */
export async function updateLandingSettingsAction(
  _prev: LandingActionResult | null,
  formData: FormData,
): Promise<LandingActionResult> {
  const parsed = updateSettingsSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    publicName: formData.get("publicName") ?? "",
    slug: slugifyLanding(String(formData.get("slug") ?? "")),
    productId: formData.get("productId") ?? "",
    productSync: formData.get("productSync") === "on",
    language: formData.get("language") ?? "pt-PT",
    country: formData.get("country") ?? "PT",
    currency: formData.get("currency") ?? "EUR",
    logoUrl: formData.get("logoUrl") ?? "",
    faviconUrl: formData.get("faviconUrl") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context)
    return { ok: false, error: "Sessão expirada. Entre novamente." };

  const data = parsed.data;

  try {
    const db = getDb();

    if (!(await isSlugAvailable(context.workspaceId, data.slug, data.id))) {
      return {
        ok: false,
        error: `Já existe uma página no endereço "${data.slug}".`,
      };
    }

    const productId = data.productId || null;
    const productData = productId
      ? await loadProductData(productId, context.workspaceId)
      : null;

    if (productId && !productData) {
      return { ok: false, error: "Produto não encontrado neste workspace." };
    }

    const [row] = await db
      .update(landingPages)
      .set({
        name: data.name,
        publicName: data.publicName || data.name,
        slug: data.slug,
        productId,
        // A cópia congelada é reescrita a cada gravação enquanto a
        // sincronização estiver ligada; ao desligar, é ela que passa a valer.
        ...(productData && data.productSync
          ? { productSnapshot: productData }
          : {}),
        productSync: data.productSync,
        language: data.language,
        country: data.country,
        currency: data.currency,
        logoUrl: data.logoUrl || null,
        faviconUrl: data.faviconUrl || null,
        draftVersion: sql`${landingPages.draftVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(landingPages.id, data.id),
          eq(landingPages.workspaceId, context.workspaceId),
          isNull(landingPages.deletedAt),
        ),
      )
      .returning({ slug: landingPages.slug });

    if (!row) return { ok: false, error: "Página não encontrada." };

    revalidateLanding(row.slug);
    return { ok: true, message: "Informações atualizadas.", slug: row.slug };
  } catch (error) {
    console.error("[landing-pages] erro ao atualizar informações:", error);
    return { ok: false, error: "Não foi possível atualizar." };
  }
}

/** Congela os dados atuais do catálogo nesta página (cópia personalizável). */
export async function detachProductAction(
  formData: FormData,
): Promise<LandingActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context) return { ok: false, error: "Sessão expirada." };

  const db = getDb();
  const [page] = await db
    .select({
      productId: landingPages.productId,
      slug: landingPages.slug,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);

  if (!page?.productId) {
    return { ok: false, error: "A página não tem produto vinculado." };
  }

  const productData = await loadProductData(
    page.productId,
    context.workspaceId,
  );
  if (!productData) return { ok: false, error: "Produto não encontrado." };

  await db
    .update(landingPages)
    .set({
      productSnapshot: productData,
      productSync: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
      ),
    );

  revalidateLanding(page.slug);
  return {
    ok: true,
    message:
      "Cópia criada. Alterações aqui não mexem mais no produto do catálogo.",
  };
}

// ---------------------------------------------------------------------------
// Publicação
// ---------------------------------------------------------------------------

export async function publishLandingPageAction(
  _prev: LandingActionResult | null,
  formData: FormData,
): Promise<LandingActionResult> {
  const parsed = publishSchema.safeParse({
    id: formData.get("id"),
    scheduledPublishAt: formData.get("scheduledPublishAt") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context)
    return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { id, scheduledPublishAt } = parsed.data;

  let scheduledAt: Date | null = null;
  if (scheduledPublishAt) {
    const parsedDate = new Date(scheduledPublishAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return { ok: false, error: "Data de agendamento inválida." };
    }
    scheduledAt = parsedDate;
  }

  try {
    const db = getDb();

    const [row] = await db
      .select()
      .from(landingPages)
      .where(
        and(
          eq(landingPages.id, id),
          eq(landingPages.workspaceId, context.workspaceId),
          isNull(landingPages.deletedAt),
        ),
      )
      .limit(1);

    if (!row) return { ok: false, error: "Página não encontrada." };

    // Uma página hospedada fora não se publica com uma escrita no banco: o
    // que está no ar é o site do outro projeto, e gravar aqui um snapshot
    // vazio só criaria uma segunda versão da página em `/lp/<slug>` — a
    // divergir da que o anúncio aponta.
    if (row.hostingProvider !== "infinity") {
      return {
        ok: false,
        error:
          "Esta página é servida fora do Infinity. Use “Republicar na Vercel” para pôr no ar a versão nova.",
      };
    }

    const content = withContentDefaults(row.content);
    const product = row.productId
      ? await loadProductData(row.productId, context.workspaceId)
      : null;

    const issues = validateForPublish({
      slug: row.slug,
      productId: row.productId,
      product,
      content,
    });

    if (issues.length > 0) {
      await db
        .update(landingPages)
        .set({ lastError: issues[0].message })
        .where(eq(landingPages.id, id));
      return { ok: false, error: issues.map((i) => i.message).join(" ") };
    }

    const nextVersion = (row.publishedVersion ?? 0) + 1;
    const customCode = withCustomCodeDefaults(row.customCode);

    const snapshot: LandingSnapshot = {
      version: nextVersion,
      publicName: row.publicName ?? row.name,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      language: row.language,
      currency: row.currency,
      content,
      theme: withThemeDefaults(row.theme),
      seo: withSeoDefaults(row.seo),
      tracking: withTrackingDefaults(row.tracking),
      customCode: {
        ...customCode,
        css: sanitizeCss(customCode.css),
        javascript: guardScript(customCode.javascript),
      },
      product,
      publishedAt: new Date().toISOString(),
    };

    await db.transaction(async (tx) => {
      await tx.insert(landingPageVersions).values({
        workspaceId: context.workspaceId,
        landingPageId: id,
        version: nextVersion,
        content: snapshot,
        note: scheduledAt
          ? `Agendada para ${scheduledAt.toLocaleString("pt-PT")}`
          : "Publicação",
        createdBy: context.userId,
        isPublished: true,
      });

      await tx
        .update(landingPageVersions)
        .set({ isPublished: false })
        .where(
          and(
            eq(landingPageVersions.landingPageId, id),
            ne(landingPageVersions.version, nextVersion),
          ),
        );

      await tx
        .update(landingPages)
        .set({
          status: "published",
          publishedSnapshot: snapshot,
          publishedVersion: nextVersion,
          draftVersion: nextVersion,
          publishedBy: context.userId,
          publishedAt: new Date(),
          scheduledPublishAt: scheduledAt,
          pausedAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, id));
    });

    await recordAuditLog({
      action: "landing_page.published",
      entityType: "landing_page",
      entityId: id,
      changes: { slug: row.slug, version: nextVersion },
    });

    revalidateLanding(row.slug);
    return {
      ok: true,
      slug: row.slug,
      message: scheduledAt
        ? `Publicação agendada para ${scheduledAt.toLocaleString("pt-PT")}.`
        : `Página publicada (versão ${nextVersion}).`,
    };
  } catch (error) {
    console.error("[landing-pages] erro ao publicar:", error);
    return { ok: false, error: "Não foi possível publicar a página." };
  }
}

/**
 * Publicar a partir de um menu de ações, onde não há `useActionState` para
 * fornecer o estado anterior.
 */
export async function publishLandingPageDirectAction(
  formData: FormData,
): Promise<LandingActionResult> {
  return publishLandingPageAction(null, formData);
}

/** Tira a página do ar sem apagar nada. */
export async function pauseLandingPageAction(
  formData: FormData,
): Promise<LandingActionResult> {
  const id = String(formData.get("id") ?? "");
  const resume = formData.get("resume") === "true";
  if (!id || !isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context) return { ok: false, error: "Sessão expirada." };

  const db = getDb();
  const [row] = await db
    .update(landingPages)
    .set({ pausedAt: resume ? null : new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .returning({ slug: landingPages.slug });

  if (!row) return { ok: false, error: "Página não encontrada." };

  await recordAuditLog({
    action: resume ? "landing_page.resumed" : "landing_page.paused",
    entityType: "landing_page",
    entityId: id,
    changes: { slug: row.slug },
  });

  revalidateLanding(row.slug);
  return {
    ok: true,
    message: resume ? "Página novamente no ar." : "Página pausada.",
  };
}

export async function duplicateLandingPageAction(
  formData: FormData,
): Promise<LandingActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context) return { ok: false, error: "Sessão expirada." };

  const db = getDb();
  const [row] = await db
    .select()
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "Página não encontrada." };

  // Sufixo numérico até encontrar um endereço livre.
  let slug = `${row.slug}-copia`.slice(0, 60);
  let attempt = 2;
  while (!(await isSlugAvailable(context.workspaceId, slug))) {
    slug = `${row.slug}-copia-${attempt}`.slice(0, 60);
    attempt += 1;
    if (attempt > 50)
      return { ok: false, error: "Não foi possível gerar um endereço livre." };
  }

  const [created] = await db
    .insert(landingPages)
    .values({
      workspaceId: context.workspaceId,
      name: `${row.name} (cópia)`,
      publicName: row.publicName,
      slug,
      status: "draft",
      template: row.template,
      content: row.content,
      theme: row.theme,
      seo: row.seo,
      tracking: row.tracking,
      customCode: row.customCode,
      productId: row.productId,
      productSnapshot: row.productSnapshot,
      productSync: row.productSync,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      language: row.language,
      country: row.country,
      currency: row.currency,
      draftVersion: 1,
      previewToken: randomUUID(),
    })
    .returning({ id: landingPages.id, slug: landingPages.slug });

  await recordAuditLog({
    action: "landing_page.duplicated",
    entityType: "landing_page",
    entityId: created.id,
    changes: { from: row.slug, to: created.slug },
  });

  revalidateLanding();
  return {
    ok: true,
    id: created.id,
    slug: created.slug,
    message: "Cópia criada como rascunho.",
  };
}

/** Traz uma versão do histórico de volta para o rascunho atual. */
export async function restoreLandingVersionAction(
  formData: FormData,
): Promise<LandingActionResult> {
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version"));
  if (!id || !Number.isFinite(version) || !isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context) return { ok: false, error: "Sessão expirada." };

  const db = getDb();

  const [versionRow] = await db
    .select({ content: landingPageVersions.content })
    .from(landingPageVersions)
    .where(
      and(
        eq(landingPageVersions.landingPageId, id),
        eq(landingPageVersions.workspaceId, context.workspaceId),
        eq(landingPageVersions.version, version),
      ),
    )
    .limit(1);

  if (!versionRow) return { ok: false, error: "Versão não encontrada." };

  const snapshot = versionRow.content as LandingSnapshot;

  const [row] = await db
    .update(landingPages)
    .set({
      content: snapshot.content,
      theme: snapshot.theme,
      seo: snapshot.seo,
      tracking: snapshot.tracking,
      customCode: snapshot.customCode,
      draftVersion: sql`${landingPages.draftVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .returning({ slug: landingPages.slug });

  if (!row) return { ok: false, error: "Página não encontrada." };

  await recordAuditLog({
    action: "landing_page.version_restored",
    entityType: "landing_page",
    entityId: id,
    changes: { version },
  });

  revalidateLanding(row.slug);
  return {
    ok: true,
    message: `Versão ${version} restaurada no rascunho. Publique para colocá-la no ar.`,
  };
}

/** Exclusão reversível: a página sai do ar e da listagem, mas nada é perdido. */
export async function deleteLandingPageAction(
  formData: FormData,
): Promise<LandingActionResult> {
  const id = String(formData.get("id") ?? "");
  const confirmation = String(formData.get("confirm") ?? "");
  if (!id || !isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context) return { ok: false, error: "Sessão expirada." };

  const db = getDb();

  const [page] = await db
    .select({ slug: landingPages.slug })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .limit(1);

  if (!page) return { ok: false, error: "Página não encontrada." };

  if (confirmation.trim().toLowerCase() !== page.slug.toLowerCase()) {
    return {
      ok: false,
      error: `Escreva "${page.slug}" para confirmar a exclusão.`,
    };
  }

  await db
    .update(landingPages)
    .set({
      deletedAt: new Date(),
      status: "archived",
      pausedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
      ),
    );

  await recordAuditLog({
    action: "landing_page.deleted",
    entityType: "landing_page",
    entityId: id,
    changes: { slug: page.slug },
  });

  revalidateLanding(page.slug);
  return { ok: true, message: "Página excluída." };
}

/** Gera (ou renova) o token do preview privado. */
export async function rotatePreviewTokenAction(
  formData: FormData,
): Promise<LandingActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return NO_DB;

  const context = await requireWorkspace();
  if (!context) return { ok: false, error: "Sessão expirada." };

  const token = randomUUID();
  const db = getDb();

  const [row] = await db
    .update(landingPages)
    .set({ previewToken: token, updatedAt: new Date() })
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, context.workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .returning({ slug: landingPages.slug });

  if (!row) return { ok: false, error: "Página não encontrada." };

  return { ok: true, message: "Novo link de pré-visualização gerado." };
}
