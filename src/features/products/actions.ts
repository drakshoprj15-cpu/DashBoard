"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { products } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { recordAuditLog } from "@/features/audit/log";
import {
  createProductSchema,
  slugify,
  updateProductCoreSchema,
  updateProductLandingSchema,
} from "@/validations/product-crud";

export interface ProductActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

function readProductFormFields(formData: FormData) {
  const rawPrice = formData.get("price");
  const priceCents =
    rawPrice && Number.isFinite(Number(rawPrice))
      ? Math.round(Number(rawPrice) * 100)
      : undefined;

  return {
    type: formData.get("type"),
    priceCents,
    currency: formData.get("currency"),
    shortDescription: formData.get("shortDescription") || undefined,
    mainImageUrl: formData.get("mainImageUrl") || "",
    trackInventory: formData.get("trackInventory") === "on",
    stockQuantity: formData.get("stockQuantity") || 0,
  };
}

export async function createProductAction(
  _prev: ProductActionResult | null,
  formData: FormData,
): Promise<ProductActionResult> {
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();

  const parsed = createProductSchema.safeParse({
    name: rawName,
    slug: rawSlug || slugify(rawName),
    ...readProductFormFields(formData),
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

    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          eq(products.slug, d.slug),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return {
        ok: false,
        error: `Já existe um produto com o endereço "${d.slug}". Escolha outro.`,
      };
    }

    const [created] = await db
      .insert(products)
      .values({
        workspaceId,
        name: d.name,
        slug: d.slug,
        type: d.type,
        status: "draft",
        priceCents: d.priceCents,
        currency: d.currency,
        shortDescription: d.shortDescription || null,
        mainImageUrl: d.mainImageUrl || null,
        trackInventory: d.trackInventory ?? false,
        stockQuantity: d.stockQuantity ?? 0,
      })
      .returning({ id: products.id });

    await recordAuditLog({
      action: "product.created",
      entityType: "product",
      entityId: created.id,
      changes: { name: d.name, slug: d.slug, priceCents: d.priceCents },
    });

    revalidatePath("/catalogo/produtos");
    return { ok: true, message: "Produto criado como rascunho." };
  } catch (error) {
    console.error("[products] erro ao criar:", error);
    return { ok: false, error: "Não foi possível criar o produto." };
  }
}

/** Alterna entre rascunho e ativo. Só produtos ativos abrem a landing pública. */
export async function toggleProductStatusAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const activate = formData.get("activate") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .update(products)
    .set({ status: activate ? "active" : "draft", updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.workspaceId, workspaceId)))
    .returning({ slug: products.slug });

  if (row) {
    await recordAuditLog({
      action: activate ? "product.activated" : "product.deactivated",
      entityType: "product",
      entityId: id,
      changes: { slug: row.slug },
    });
  }

  revalidatePath("/catalogo/produtos");
  revalidatePath("/landing-pages");
  if (row) revalidatePath(`/p/${row.slug}`);
}

export async function archiveProductAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .update(products)
    .set({ deletedAt: new Date(), status: "archived" })
    .where(and(eq(products.id, id), eq(products.workspaceId, workspaceId)))
    .returning({ slug: products.slug });

  if (row) {
    await recordAuditLog({
      action: "product.archived",
      entityType: "product",
      entityId: id,
      changes: { slug: row.slug },
    });
  }

  revalidatePath("/catalogo/produtos");
  revalidatePath("/landing-pages");
  if (row) revalidatePath(`/p/${row.slug}`);
}

export async function updateProductCoreAction(
  _prev: ProductActionResult | null,
  formData: FormData,
): Promise<ProductActionResult> {
  const parsed = updateProductCoreSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    ...readProductFormFields(formData),
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

    const conflict = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          eq(products.slug, d.slug),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);

    if (conflict.length > 0 && conflict[0].id !== id) {
      return {
        ok: false,
        error: `Já existe um produto com o endereço "${d.slug}". Escolha outro.`,
      };
    }

    const [row] = await db
      .update(products)
      .set({
        name: d.name,
        slug: d.slug,
        type: d.type,
        priceCents: d.priceCents,
        currency: d.currency,
        shortDescription: d.shortDescription || null,
        mainImageUrl: d.mainImageUrl || null,
        trackInventory: d.trackInventory ?? false,
        stockQuantity: d.stockQuantity ?? 0,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.workspaceId, workspaceId)))
      .returning({ slug: products.slug });

    if (!row) return { ok: false, error: "Produto não encontrado." };

    await recordAuditLog({
      action: "product.updated",
      entityType: "product",
      entityId: id,
      changes: { name: d.name, slug: d.slug, priceCents: d.priceCents },
    });

    revalidatePath("/catalogo/produtos");
    revalidatePath(`/catalogo/produtos/${id}`);
    revalidatePath("/landing-pages");
    revalidatePath(`/p/${row.slug}`);
    return { ok: true, message: "Dados do produto atualizados." };
  } catch (error) {
    console.error("[products] erro ao atualizar dados:", error);
    return { ok: false, error: "Não foi possível atualizar o produto." };
  }
}

function toCentsOrUndefined(raw: FormDataEntryValue | null): number | undefined {
  if (!raw || !Number.isFinite(Number(raw))) return undefined;
  return Math.round(Number(raw) * 100);
}

export async function updateProductLandingAction(
  _prev: ProductActionResult | null,
  formData: FormData,
): Promise<ProductActionResult> {
  const parsed = updateProductLandingSchema.safeParse({
    id: formData.get("id"),
    brand: formData.get("brand") || undefined,
    compareAtPriceCents: toCentsOrUndefined(formData.get("compareAtPrice")),
    gallery: formData.get("gallery") ?? "",
    freeShippingFromCents:
      toCentsOrUndefined(formData.get("freeShippingFrom")) ?? 0,
    deliveryEstimate: formData.get("deliveryEstimate") || undefined,
    returnDays: formData.get("returnDays") || undefined,
    description: formData.get("description") ?? "",
    highlights: formData.get("highlights") ?? "",
    specs: formData.get("specs") ?? "",
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
    const { id, ...content } = parsed.data;

    const [row] = await db
      .update(products)
      .set({ landingContent: content, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.workspaceId, workspaceId)))
      .returning({ slug: products.slug });

    if (!row) return { ok: false, error: "Produto não encontrado." };

    revalidatePath(`/catalogo/produtos/${id}`);
    revalidatePath("/landing-pages");
    revalidatePath(`/p/${row.slug}`);
    return { ok: true, message: "Landing page atualizada." };
  } catch (error) {
    console.error("[products] erro ao atualizar landing:", error);
    return { ok: false, error: "Não foi possível atualizar a landing page." };
  }
}
