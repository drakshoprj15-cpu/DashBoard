/**
 * Regras puras de variação: preço, desconto, combinações e identificadores.
 *
 * Nada aqui toca no banco nem no React — é o mesmo cálculo usado no painel,
 * na landing pública e na revalidação do checkout. Ter uma fonte única evita
 * o erro clássico de a página mostrar 65% e o servidor cobrar outro valor.
 *
 * Dinheiro sempre em centavos (inteiros). Nenhuma conta em ponto flutuante.
 */

import { slugify } from "@/validations/product-crud";

export type VariantStatus = "active" | "sold_out" | "unavailable";

export const VARIANT_STATUSES: VariantStatus[] = [
  "active",
  "sold_out",
  "unavailable",
];

export const VARIANT_STATUS_LABEL: Record<VariantStatus, string> = {
  active: "Ativa",
  sold_out: "Esgotada",
  unavailable: "Indisponível",
};

export function isVariantStatus(value: unknown): value is VariantStatus {
  return (
    typeof value === "string" && (VARIANT_STATUSES as string[]).includes(value)
  );
}

/**
 * Percentual de desconto arredondado.
 *
 * Devolve `null` quando não há desconto real a mostrar: sem preço anterior,
 * preço anterior menor ou igual ao atual, ou valores inválidos. A landing
 * usa exatamente este `null` para esconder selo, economia e preço riscado
 * ao mesmo tempo — nunca "-0%" nem riscado sem desconto.
 */
export function discountPercent(
  priceCents: number,
  compareAtPriceCents: number | null | undefined,
): number | null {
  if (!Number.isFinite(priceCents) || priceCents < 0) return null;
  if (
    compareAtPriceCents === null ||
    compareAtPriceCents === undefined ||
    !Number.isFinite(compareAtPriceCents)
  ) {
    return null;
  }
  if (compareAtPriceCents <= priceCents) return null;

  const percent = Math.round((1 - priceCents / compareAtPriceCents) * 100);
  return percent > 0 ? percent : null;
}

/** Quanto o cliente economiza, em centavos. 0 quando não há desconto. */
export function savingsCents(
  priceCents: number,
  compareAtPriceCents: number | null | undefined,
): number {
  if (discountPercent(priceCents, compareAtPriceCents) === null) return 0;
  return (compareAtPriceCents as number) - priceCents;
}

export interface PriceView {
  priceCents: number;
  compareAtPriceCents: number | null;
  discountPercent: number | null;
  savingsCents: number;
  /** Só mostra o preço riscado quando ele é maior que o atual */
  showCompareAt: boolean;
}

/** Bloco de preço coerente: nunca desconto sem riscado, nem riscado sem desconto. */
export function buildPriceView(
  priceCents: number,
  compareAtPriceCents: number | null | undefined,
): PriceView {
  const discount = discountPercent(priceCents, compareAtPriceCents);
  return {
    priceCents,
    compareAtPriceCents:
      discount === null ? null : (compareAtPriceCents as number),
    discountPercent: discount,
    savingsCents: savingsCents(priceCents, compareAtPriceCents),
    showCompareAt: discount !== null,
  };
}

/** Preço que vale: o da variação quando existe, senão o do produto. */
export function effectivePriceCents(
  variantPriceCents: number | null | undefined,
  productPriceCents: number,
): number {
  return typeof variantPriceCents === "number" && variantPriceCents >= 0
    ? variantPriceCents
    : productPriceCents;
}

export interface PurchasableInput {
  status: VariantStatus;
  stockQuantity: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  archivedAt?: Date | string | null;
}

/**
 * A variação pode ser comprada agora?
 *
 * Mesma função usada para desativar o card na página e para recusar o
 * pedido no servidor — é o que impede "comprei e depois deu esgotado".
 */
export function isPurchasable(
  variant: PurchasableInput,
  quantity = 1,
): boolean {
  if (variant.archivedAt) return false;
  if (variant.status !== "active") return false;
  if (quantity < 1) return false;
  if (!variant.trackInventory) return true;
  if (variant.allowBackorder) return true;
  return variant.stockQuantity >= quantity;
}

/** Quantidade máxima que o cliente pode levar desta variação. */
export function maxPurchasableQuantity(
  variant: PurchasableInput & { purchaseLimit?: number | null },
  hardLimit = 10,
): number {
  if (!isPurchasable(variant)) return 0;
  const limits = [hardLimit];
  if (variant.purchaseLimit && variant.purchaseLimit > 0) {
    limits.push(variant.purchaseLimit);
  }
  if (variant.trackInventory && !variant.allowBackorder) {
    limits.push(variant.stockQuantity);
  }
  return Math.max(0, Math.min(...limits));
}

// ---------------------------------------------------------------------------
// Identificadores e combinações
// ---------------------------------------------------------------------------

/** Texto seguro para URL e chave de combinação (sem acentos nem espaços). */
export function slugifyValue(value: string): string {
  return slugify(value).slice(0, 60);
}

export interface OptionPair {
  optionName: string;
  value: string;
}

/**
 * Chave normalizada da combinação ("cor:preto|tamanho:m").
 *
 * Ordenada pelo nome do atributo para que Cor+Tamanho e Tamanho+Cor gerem a
 * mesma chave — é o que o índice único do banco usa para recusar combinações
 * duplicadas.
 */
export function buildOptionsKey(pairs: OptionPair[]): string {
  return pairs
    .map(
      (pair) => `${slugifyValue(pair.optionName)}:${slugifyValue(pair.value)}`,
    )
    .sort()
    .join("|");
}

/** Nome legível da combinação ("Preto · M"). */
export function buildVariantName(pairs: OptionPair[]): string {
  return pairs.map((pair) => pair.value).join(" · ");
}

/** Produto cartesiano dos valores de cada atributo. */
export function cartesian<T>(lists: T[][]): T[][] {
  if (lists.length === 0) return [];
  return lists.reduce<T[][]>(
    (accumulated, list) =>
      accumulated.flatMap((combo) => list.map((item) => [...combo, item])),
    [[]],
  );
}

/**
 * SKU sugerido a partir do SKU-base do produto e dos valores escolhidos.
 * É só uma sugestão: o administrador pode sobrescrever e a unicidade é
 * garantida pelo índice do banco, não por esta função.
 */
export function suggestSku(base: string, values: string[]): string {
  const root = slugifyValue(base || "sku")
    .toUpperCase()
    .replace(/-/g, "");
  const parts = values.map((value) =>
    slugifyValue(value).toUpperCase().replace(/-/g, "").slice(0, 6),
  );
  return [root, ...parts].filter(Boolean).join("-").slice(0, 64);
}

/**
 * Identificador público da variação usado em `?variant=`.
 * Legível (ajuda a depurar links de anúncio) e sem revelar o UUID interno.
 */
export function buildPublicId(pairs: OptionPair[], fallback: string): string {
  const readable = pairs.map((pair) => slugifyValue(pair.value)).join("-");
  return readable || slugifyValue(fallback) || "opcao";
}

/** Garante unicidade dentro do produto acrescentando sufixo numérico. */
export function uniquePublicId(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) return candidate;
  let counter = 2;
  while (taken.has(`${candidate}-${counter}`)) counter += 1;
  return `${candidate}-${counter}`;
}
