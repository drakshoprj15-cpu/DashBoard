import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  checkouts,
  productImages,
  productVariants,
  products,
} from "@/database/schema";

import type { LandingProductData, LandingProductVariant } from "./types";

/**
 * Carrega do catálogo tudo o que uma landing precisa do produto: preço,
 * imagens, variações e o endereço do checkout que já existe na plataforma.
 *
 * O checkout **não** é reinventado aqui: se o produto tiver um checkout
 * publicado próprio, a landing usa o slug dele; caso contrário cai no slug
 * do produto, exatamente como a rota `/checkout/[slug]` já resolve hoje.
 */
export async function loadProductData(
  productId: string,
  workspaceId: string,
): Promise<LandingProductData | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, workspaceId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);

  if (!product) return null;

  const [images, variants, checkoutRows] = await Promise.all([
    db
      .select({ url: productImages.url })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.position)),
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        priceCents: productVariants.priceCents,
        stockQuantity: productVariants.stockQuantity,
        attributes: productVariants.attributes,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          eq(productVariants.isActive, true),
        ),
      )
      .orderBy(asc(productVariants.name)),
    db
      .select({ slug: checkouts.slug })
      .from(checkouts)
      .where(
        and(
          eq(checkouts.workspaceId, workspaceId),
          eq(checkouts.mainProductId, productId),
          eq(checkouts.status, "published"),
          isNull(checkouts.deletedAt),
        ),
      )
      .limit(1),
  ]);

  const landingContent = (product.landingContent ?? {}) as {
    gallery?: unknown;
    compareAtPriceCents?: unknown;
  };

  const contentGallery = Array.isArray(landingContent.gallery)
    ? landingContent.gallery.filter((v): v is string => typeof v === "string")
    : [];

  const gallery = [
    ...(product.mainImageUrl ? [product.mainImageUrl] : []),
    ...images.map((i) => i.url),
    ...contentGallery,
  ].filter((url, index, all) => all.indexOf(url) === index);

  const comparePriceCents =
    typeof landingContent.compareAtPriceCents === "number"
      ? landingContent.compareAtPriceCents
      : null;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription ?? "",
    description: product.description ?? "",
    priceCents: product.promoPriceCents ?? product.priceCents,
    comparePriceCents:
      product.promoPriceCents !== null && product.promoPriceCents !== undefined
        ? product.priceCents
        : comparePriceCents,
    currency: product.currency,
    mainImageUrl: product.mainImageUrl,
    gallery,
    variants: variants.map(toLandingVariant),
    trackInventory: product.trackInventory,
    stockQuantity: product.stockQuantity,
    checkoutSlug: checkoutRows[0]?.slug ?? product.slug,
  };
}

function toLandingVariant(row: {
  id: string;
  name: string;
  priceCents: number | null;
  stockQuantity: number;
  attributes: unknown;
}): LandingProductVariant {
  const attributes: Record<string, string> = {};
  if (row.attributes && typeof row.attributes === "object") {
    for (const [key, value] of Object.entries(
      row.attributes as Record<string, unknown>,
    )) {
      if (typeof value === "string") attributes[key] = value;
    }
  }

  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents,
    stockQuantity: row.stockQuantity,
    attributes,
  };
}

/** Converte o JSON gravado em `product_snapshot` de volta ao tipo. */
export function parseProductSnapshot(raw: unknown): LandingProductData | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<LandingProductData>;
  if (!value.id || !value.slug || typeof value.priceCents !== "number") {
    return null;
  }

  return {
    id: value.id,
    slug: value.slug,
    name: value.name ?? "",
    shortDescription: value.shortDescription ?? "",
    description: value.description ?? "",
    priceCents: value.priceCents,
    comparePriceCents: value.comparePriceCents ?? null,
    currency: value.currency ?? "EUR",
    mainImageUrl: value.mainImageUrl ?? null,
    gallery: Array.isArray(value.gallery) ? value.gallery : [],
    variants: Array.isArray(value.variants) ? value.variants : [],
    trackInventory: Boolean(value.trackInventory),
    stockQuantity: value.stockQuantity ?? 0,
    checkoutSlug: value.checkoutSlug ?? value.slug,
  };
}

/**
 * Dados do produto de uma landing: do catálogo quando a sincronização está
 * ligada, da cópia congelada quando está desligada.
 */
export async function resolveLandingProduct(
  page: {
    productId: string | null;
    productSync: boolean;
    productSnapshot: unknown;
  },
  workspaceId: string,
): Promise<LandingProductData | null> {
  if (!page.productSync) return parseProductSnapshot(page.productSnapshot);
  if (!page.productId) return null;

  const fresh = await loadProductData(page.productId, workspaceId);
  // Produto arquivado depois de a página ter sido criada: a cópia antiga
  // mantém a página no ar em vez de a deixar sem preço nem botão.
  return fresh ?? parseProductSnapshot(page.productSnapshot);
}
