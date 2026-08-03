import type { VariantStatus } from "./pricing";

/** Dimensões de envio da variação, em centímetros. */
export interface VariantDimensions {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
}

export interface OptionValueRow {
  id: string;
  value: string;
  label: string | null;
  hexColor: string | null;
  thumbnailUrl: string | null;
  position: number;
}

export interface OptionRow {
  id: string;
  name: string;
  position: number;
  values: OptionValueRow[];
}

export interface VariantMediaRow {
  id: string;
  url: string;
  alt: string | null;
  position: number;
  isPrimary: boolean;
}

/** Valor escolhido pela variação em cada atributo. */
export interface VariantOptionValueRow {
  optionId: string;
  optionName: string;
  valueId: string;
  value: string;
  label: string | null;
  hexColor: string | null;
  thumbnailUrl: string | null;
}

export interface VariantRow {
  id: string;
  publicId: string;
  name: string;
  publicName: string | null;
  sku: string | null;
  barcode: string | null;
  priceCents: number | null;
  compareAtPriceCents: number | null;
  costCents: number | null;
  currency: string | null;
  stockQuantity: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  purchaseLimit: number | null;
  status: VariantStatus;
  isDefault: boolean;
  position: number;
  weightGrams: number | null;
  dimensions: VariantDimensions | null;
  mainImageUrl: string | null;
  thumbnailUrl: string | null;
  shareImageUrl: string | null;
  hexColor: string | null;
  archivedAt: string | null;
  optionValues: VariantOptionValueRow[];
  media: VariantMediaRow[];
  /** Itens de pedido que apontam para esta variação — trava a exclusão */
  orderItemCount: number;
}

/** Tudo o que a aba Variações do painel precisa mostrar de uma vez. */
export interface ProductVariantsData {
  productId: string;
  productName: string;
  productSlug: string;
  productPriceCents: number;
  productCurrency: string;
  productMainImageUrl: string | null;
  hasVariants: boolean;
  options: OptionRow[];
  variants: VariantRow[];
}

/** Resumo por produto usado na listagem do catálogo. */
export interface ProductVariantSummary {
  variantCount: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  totalStock: number;
  soldOutCount: number;
  /** Amostras de cor das variações, para o pontinho colorido na lista */
  colors: { label: string; hexColor: string | null }[];
}
