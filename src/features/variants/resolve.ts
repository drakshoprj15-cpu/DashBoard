import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  productOptionValues,
  productOptions,
  productVariantValues,
  productVariants,
} from "@/database/schema";

import {
  effectivePriceCents,
  isPurchasable,
  isVariantStatus,
  maxPurchasableQuantity,
  type VariantStatus,
} from "./pricing";

/**
 * Leitura das variações no servidor, para o checkout e o pedido.
 *
 * O navegador manda no máximo um identificador público (`?variant=preto`).
 * Preço, estoque, estado e nome vêm sempre daqui — nunca do formulário.
 */

export interface CheckoutVariant {
  id: string;
  publicId: string;
  /** Nome mostrado ao cliente */
  label: string;
  sku: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  hexColor: string | null;
  stockQuantity: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  purchaseLimit: number | null;
  status: VariantStatus;
  weightGrams: number | null;
  isDefault: boolean;
  position: number;
  /** `{ "Cor": "Preto" }` — gravado no pedido como cópia congelada */
  options: Record<string, string>;
  purchasable: boolean;
  maxQuantity: number;
}

interface RawVariantRow {
  id: string;
  publicId: string | null;
  name: string;
  publicName: string | null;
  sku: string | null;
  priceCents: number | null;
  compareAtPriceCents: number | null;
  currency: string | null;
  mainImageUrl: string | null;
  thumbnailUrl: string | null;
  hexColor: string | null;
  stockQuantity: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  purchaseLimit: number | null;
  status: string;
  weightGrams: number | null;
  isDefault: boolean;
  position: number;
  attributes: unknown;
}

function toOptions(raw: unknown): Record<string, string> {
  const options: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") options[key] = value;
    }
  }
  return options;
}

function toCheckoutVariant(
  row: RawVariantRow,
  productPriceCents: number,
  optionsFromValues?: Record<string, string>,
): CheckoutVariant {
  const status: VariantStatus = isVariantStatus(row.status)
    ? row.status
    : "active";
  const base = {
    status,
    stockQuantity: row.stockQuantity,
    trackInventory: row.trackInventory,
    allowBackorder: row.allowBackorder,
    purchaseLimit: row.purchaseLimit,
  };

  return {
    id: row.id,
    publicId: row.publicId ?? row.id,
    label: row.publicName ?? row.name,
    sku: row.sku,
    priceCents: effectivePriceCents(row.priceCents, productPriceCents),
    compareAtPriceCents: row.compareAtPriceCents,
    currency: row.currency,
    imageUrl: row.mainImageUrl,
    thumbnailUrl: row.thumbnailUrl,
    hexColor: row.hexColor,
    stockQuantity: row.stockQuantity,
    trackInventory: row.trackInventory,
    allowBackorder: row.allowBackorder,
    purchaseLimit: row.purchaseLimit,
    status,
    weightGrams: row.weightGrams,
    isDefault: row.isDefault,
    position: row.position,
    options:
      optionsFromValues && Object.keys(optionsFromValues).length > 0
        ? optionsFromValues
        : toOptions(row.attributes),
    purchasable: isPurchasable(base),
    maxQuantity: maxPurchasableQuantity(base),
  };
}

/**
 * Variações vendáveis de um produto, na ordem em que aparecem na página.
 * Arquivadas ficam de fora — não podem ser compradas nem escolhidas.
 */
export async function listCheckoutVariants(
  productId: string,
  productPriceCents: number,
): Promise<CheckoutVariant[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();

  const [rows, valueRows] = await Promise.all([
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
        value: productOptionValues.value,
        label: productOptionValues.label,
        optionPosition: productOptions.position,
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
  ]);

  return rows.map((row) => {
    const options: Record<string, string> = {};
    for (const value of valueRows
      .filter((entry) => entry.variantId === row.id)
      .sort((a, b) => a.optionPosition - b.optionPosition)) {
      options[value.optionName] = value.label ?? value.value;
    }
    return toCheckoutVariant(row as RawVariantRow, productPriceCents, options);
  });
}

export type VariantResolution =
  | { kind: "no_variants" }
  | { kind: "ok"; variant: CheckoutVariant }
  | { kind: "not_found" }
  | { kind: "not_purchasable"; variant: CheckoutVariant }
  | { kind: "insufficient_stock"; variant: CheckoutVariant };

/**
 * Resolve a variação de uma compra a partir do identificador público.
 *
 * Regras que o navegador não pode contornar:
 * - a variação tem de pertencer ao produto (e o produto ao workspace);
 * - variação arquivada, indisponível ou esgotada nunca é aceita;
 * - a quantidade é comparada com o estoque real gravado no banco.
 */
export async function resolveVariantForPurchase(params: {
  productId: string;
  productPriceCents: number;
  publicId: string | null;
  quantity: number;
}): Promise<VariantResolution> {
  const variants = await listCheckoutVariants(
    params.productId,
    params.productPriceCents,
  );

  if (variants.length === 0) return { kind: "no_variants" };

  const requested = params.publicId?.trim() ?? "";
  const variant = requested
    ? variants.find((item) => item.publicId === requested)
    : undefined;

  if (!variant) return { kind: "not_found" };
  if (!variant.purchasable) return { kind: "not_purchasable", variant };
  if (
    variant.trackInventory &&
    !variant.allowBackorder &&
    variant.stockQuantity < params.quantity
  ) {
    return { kind: "insufficient_stock", variant };
  }

  return { kind: "ok", variant };
}

/** Variação que abre selecionada: a padrão, ou a primeira que dá para comprar. */
export function pickDefaultVariant(
  variants: CheckoutVariant[],
): CheckoutVariant | null {
  return (
    variants.find((variant) => variant.isDefault && variant.purchasable) ??
    variants.find((variant) => variant.purchasable) ??
    variants[0] ??
    null
  );
}
