import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  orderItems,
  productOptionValues,
  productOptions,
  productVariantMedia,
  productVariantValues,
  productVariants,
  products,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { isVariantStatus, type VariantStatus } from "./pricing";

import type {
  OptionRow,
  ProductVariantSummary,
  ProductVariantsData,
  VariantDimensions,
  VariantRow,
} from "./types";

function toStatus(raw: unknown): VariantStatus {
  return isVariantStatus(raw) ? raw : "active";
}

function toDimensions(raw: unknown): VariantDimensions | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const num = (key: string) =>
    typeof value[key] === "number" && Number.isFinite(value[key])
      ? (value[key] as number)
      : null;

  const dimensions = {
    lengthCm: num("lengthCm"),
    widthCm: num("widthCm"),
    heightCm: num("heightCm"),
  };
  return dimensions.lengthCm === null &&
    dimensions.widthCm === null &&
    dimensions.heightCm === null
    ? null
    : dimensions;
}

/**
 * Atributos, valores, variações e mídia de um produto — tudo o que a aba
 * Variações do painel mostra.
 *
 * Carrega variações arquivadas de propósito: quem já vendeu naquela cor
 * precisa continuar vendo o histórico, mesmo depois de a retirar da loja.
 */
export async function getProductVariantsData(
  productId: string,
): Promise<ProductVariantsData | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      priceCents: products.priceCents,
      currency: products.currency,
      mainImageUrl: products.mainImageUrl,
      hasVariants: products.hasVariants,
      sku: products.sku,
    })
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
    optionRows,
    valueRows,
    variantRows,
    variantValueRows,
    mediaRows,
    usageRows,
  ] = await Promise.all([
    db
      .select()
      .from(productOptions)
      .where(eq(productOptions.productId, productId))
      .orderBy(asc(productOptions.position), asc(productOptions.name)),
    db
      .select({
        id: productOptionValues.id,
        optionId: productOptionValues.optionId,
        value: productOptionValues.value,
        label: productOptionValues.label,
        hexColor: productOptionValues.hexColor,
        thumbnailUrl: productOptionValues.thumbnailUrl,
        position: productOptionValues.position,
      })
      .from(productOptionValues)
      .innerJoin(
        productOptions,
        eq(productOptions.id, productOptionValues.optionId),
      )
      .where(eq(productOptions.productId, productId))
      .orderBy(
        asc(productOptionValues.position),
        asc(productOptionValues.value),
      ),
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.position), asc(productVariants.name)),
    db
      .select({
        variantId: productVariantValues.variantId,
        optionId: productVariantValues.optionId,
        optionName: productOptions.name,
        valueId: productOptionValues.id,
        value: productOptionValues.value,
        label: productOptionValues.label,
        hexColor: productOptionValues.hexColor,
        thumbnailUrl: productOptionValues.thumbnailUrl,
        optionPosition: productOptions.position,
      })
      .from(productVariantValues)
      .innerJoin(
        productVariants,
        eq(productVariants.id, productVariantValues.variantId),
      )
      .innerJoin(
        productOptions,
        eq(productOptions.id, productVariantValues.optionId),
      )
      .innerJoin(
        productOptionValues,
        eq(productOptionValues.id, productVariantValues.optionValueId),
      )
      .where(eq(productVariants.productId, productId)),
    db
      .select({
        id: productVariantMedia.id,
        variantId: productVariantMedia.variantId,
        url: productVariantMedia.url,
        alt: productVariantMedia.alt,
        position: productVariantMedia.position,
        isPrimary: productVariantMedia.isPrimary,
      })
      .from(productVariantMedia)
      .innerJoin(
        productVariants,
        eq(productVariants.id, productVariantMedia.variantId),
      )
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariantMedia.position)),
    db
      .select({
        variantId: orderItems.variantId,
        total: sql<number>`count(*)::int`,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(eq(productVariants.productId, productId))
      .groupBy(orderItems.variantId),
  ]);

  const options: OptionRow[] = optionRows.map((option) => ({
    id: option.id,
    name: option.name,
    position: option.position,
    values: valueRows
      .filter((value) => value.optionId === option.id)
      .map((value) => ({
        id: value.id,
        value: value.value,
        label: value.label,
        hexColor: value.hexColor,
        thumbnailUrl: value.thumbnailUrl,
        position: value.position,
      })),
  }));

  const usageByVariant = new Map(
    usageRows.map((row) => [row.variantId ?? "", row.total]),
  );

  const variants: VariantRow[] = variantRows.map((variant) => ({
    id: variant.id,
    publicId: variant.publicId ?? variant.id,
    name: variant.name,
    publicName: variant.publicName,
    sku: variant.sku,
    barcode: variant.barcode,
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    costCents: variant.costCents,
    currency: variant.currency,
    stockQuantity: variant.stockQuantity,
    trackInventory: variant.trackInventory,
    allowBackorder: variant.allowBackorder,
    purchaseLimit: variant.purchaseLimit,
    status: toStatus(variant.status),
    isDefault: variant.isDefault,
    position: variant.position,
    weightGrams: variant.weightGrams,
    dimensions: toDimensions(variant.dimensions),
    mainImageUrl: variant.mainImageUrl,
    thumbnailUrl: variant.thumbnailUrl,
    shareImageUrl: variant.shareImageUrl,
    hexColor: variant.hexColor,
    archivedAt: variant.archivedAt ? variant.archivedAt.toISOString() : null,
    optionValues: variantValueRows
      .filter((row) => row.variantId === variant.id)
      .sort((a, b) => a.optionPosition - b.optionPosition)
      .map((row) => ({
        optionId: row.optionId,
        optionName: row.optionName,
        valueId: row.valueId,
        value: row.value,
        label: row.label,
        hexColor: row.hexColor,
        thumbnailUrl: row.thumbnailUrl,
      })),
    media: mediaRows
      .filter((row) => row.variantId === variant.id)
      .map((row) => ({
        id: row.id,
        url: row.url,
        alt: row.alt,
        position: row.position,
        isPrimary: row.isPrimary,
      })),
    orderItemCount: usageByVariant.get(variant.id) ?? 0,
  }));

  return {
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    productPriceCents: product.priceCents,
    productCurrency: product.currency,
    productMainImageUrl: product.mainImageUrl,
    hasVariants: product.hasVariants,
    options,
    variants,
  };
}

/**
 * Resumo de variações por produto para a listagem do catálogo: quantas
 * existem, faixa de preço, estoque somado e as cores disponíveis.
 */
export async function listVariantSummaries(
  productIds: string[],
): Promise<Map<string, ProductVariantSummary>> {
  const summaries = new Map<string, ProductVariantSummary>();
  if (!isDatabaseConfigured() || productIds.length === 0) return summaries;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      productId: productVariants.productId,
      priceCents: productVariants.priceCents,
      stockQuantity: productVariants.stockQuantity,
      trackInventory: productVariants.trackInventory,
      status: productVariants.status,
      name: productVariants.name,
      publicName: productVariants.publicName,
      hexColor: productVariants.hexColor,
      position: productVariants.position,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.workspaceId, workspaceId),
        inArray(productVariants.productId, productIds),
        isNull(productVariants.archivedAt),
      ),
    )
    .orderBy(asc(productVariants.position));

  for (const row of rows) {
    const current = summaries.get(row.productId) ?? {
      variantCount: 0,
      minPriceCents: null,
      maxPriceCents: null,
      totalStock: 0,
      soldOutCount: 0,
      colors: [],
    };

    current.variantCount += 1;
    if (typeof row.priceCents === "number") {
      current.minPriceCents =
        current.minPriceCents === null
          ? row.priceCents
          : Math.min(current.minPriceCents, row.priceCents);
      current.maxPriceCents =
        current.maxPriceCents === null
          ? row.priceCents
          : Math.max(current.maxPriceCents, row.priceCents);
    }
    if (row.trackInventory) current.totalStock += row.stockQuantity;
    if (
      toStatus(row.status) !== "active" ||
      (row.trackInventory && row.stockQuantity <= 0)
    ) {
      current.soldOutCount += 1;
    }
    if (current.colors.length < 8) {
      current.colors.push({
        label: row.publicName ?? row.name,
        hexColor: row.hexColor,
      });
    }

    summaries.set(row.productId, current);
  }

  return summaries;
}
