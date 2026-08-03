import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  checkouts,
  productImages,
  productOptionValues,
  productOptions,
  productVariantMedia,
  productVariantValues,
  productVariants,
  products,
} from "@/database/schema";
import { isVariantStatus } from "@/features/variants/pricing";

import type { LandingProductData, LandingProductVariant } from "./types";

/**
 * Carrega do catálogo tudo o que uma landing precisa do produto: preço,
 * imagens, variações e o endereço do checkout que já existe na plataforma.
 *
 * O checkout **não** é reinventado aqui: se o produto tiver um checkout
 * publicado próprio, a landing usa o slug dele; caso contrário cai no slug
 * do produto, exatamente como a rota `/checkout/[slug]` já resolve hoje.
 *
 * Cada variação traz preço, preço anterior, estoque e galeria próprios — é
 * o que permite trocar tudo ao clicar numa cor sem recarregar a página.
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

  const [
    images,
    variantRows,
    variantValueRows,
    mediaRows,
    optionRows,
    checkoutRows,
  ] = await Promise.all([
    db
      .select({ url: productImages.url })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.position)),
    db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          isNull(productVariants.archivedAt),
        ),
      )
      .orderBy(asc(productVariants.position), asc(productVariants.name)),
    db
      .select({
        variantId: productVariantValues.variantId,
        optionName: productOptions.name,
        optionPosition: productOptions.position,
        value: productOptionValues.value,
        label: productOptionValues.label,
        hexColor: productOptionValues.hexColor,
        thumbnailUrl: productOptionValues.thumbnailUrl,
      })
      .from(productVariantValues)
      .innerJoin(
        productOptions,
        eq(productOptions.id, productVariantValues.optionId),
      )
      .innerJoin(
        productOptionValues,
        eq(productOptionValues.id, productVariantValues.optionValueId),
      )
      .where(eq(productOptions.productId, productId)),
    db
      .select({
        variantId: productVariantMedia.variantId,
        url: productVariantMedia.url,
        position: productVariantMedia.position,
      })
      .from(productVariantMedia)
      .innerJoin(
        productVariants,
        eq(productVariants.id, productVariantMedia.variantId),
      )
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariantMedia.position)),
    db
      .select({ name: productOptions.name, position: productOptions.position })
      .from(productOptions)
      .where(eq(productOptions.productId, productId))
      .orderBy(asc(productOptions.position)),
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

  const variants: LandingProductVariant[] = variantRows.map((variant) => {
    const attributes: Record<string, string> = {};
    for (const row of variantValueRows
      .filter((entry) => entry.variantId === variant.id)
      .sort((a, b) => a.optionPosition - b.optionPosition)) {
      attributes[row.optionName] = row.label ?? row.value;
    }

    // Sem atributos ligados (variação criada à mão), cai no jsonb antigo.
    if (Object.keys(attributes).length === 0 && variant.attributes) {
      for (const [key, value] of Object.entries(
        variant.attributes as Record<string, unknown>,
      )) {
        if (typeof value === "string") attributes[key] = value;
      }
    }

    const valueRow = variantValueRows.find(
      (entry) => entry.variantId === variant.id,
    );
    const variantGallery = mediaRows
      .filter((row) => row.variantId === variant.id)
      .map((row) => row.url);

    const mainImage = variant.mainImageUrl ?? variantGallery[0] ?? undefined;

    return {
      id: variant.id,
      publicId: variant.publicId ?? variant.id,
      name: variant.publicName ?? variant.name,
      priceCents: variant.priceCents,
      compareAtPriceCents: variant.compareAtPriceCents,
      stockQuantity: variant.stockQuantity,
      trackInventory: variant.trackInventory,
      allowBackorder: variant.allowBackorder,
      status: isVariantStatus(variant.status) ? variant.status : "active",
      sku: variant.sku,
      attributes,
      imageUrl: mainImage,
      thumbnailUrl:
        variant.thumbnailUrl ??
        valueRow?.thumbnailUrl ??
        mainImage ??
        undefined,
      hexColor: variant.hexColor ?? valueRow?.hexColor ?? undefined,
      gallery: mainImage
        ? [mainImage, ...variantGallery.filter((url) => url !== mainImage)]
        : variantGallery,
      isDefault: variant.isDefault,
      weightGrams: variant.weightGrams,
      purchaseLimit: variant.purchaseLimit,
    };
  });

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
    variants,
    variantOptionName: optionRows[0]?.name ?? "Opções",
    trackInventory: product.trackInventory,
    stockQuantity: product.stockQuantity,
    checkoutSlug: checkoutRows[0]?.slug ?? product.slug,
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
    variants: Array.isArray(value.variants)
      ? value.variants.map(normalizeSnapshotVariant)
      : [],
    variantOptionName: value.variantOptionName ?? "Opções",
    trackInventory: Boolean(value.trackInventory),
    stockQuantity: value.stockQuantity ?? 0,
    checkoutSlug: value.checkoutSlug ?? value.slug,
  };
}

/**
 * Snapshot gravado antes das variações completas não tem os campos novos.
 * Em vez de descartar a página, completamos com valores conservadores: a
 * variação continua comprável e nada de desconto é inventado.
 */
function normalizeSnapshotVariant(
  raw: Partial<LandingProductVariant> & { id?: string },
): LandingProductVariant {
  return {
    id: raw.id ?? "",
    publicId: raw.publicId ?? raw.id ?? "",
    name: raw.name ?? "",
    priceCents: raw.priceCents ?? null,
    compareAtPriceCents: raw.compareAtPriceCents ?? null,
    stockQuantity: raw.stockQuantity ?? 0,
    trackInventory: raw.trackInventory ?? false,
    allowBackorder: raw.allowBackorder ?? false,
    status: raw.status ?? "active",
    sku: raw.sku ?? null,
    attributes: raw.attributes ?? {},
    imageUrl: raw.imageUrl,
    thumbnailUrl: raw.thumbnailUrl,
    hexColor: raw.hexColor,
    gallery: Array.isArray(raw.gallery) ? raw.gallery : [],
    isDefault: raw.isDefault ?? false,
    weightGrams: raw.weightGrams ?? null,
    purchaseLimit: raw.purchaseLimit ?? null,
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
