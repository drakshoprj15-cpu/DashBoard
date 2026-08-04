import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps, softDelete } from "./_helpers";
import { discountType, productStatus, productType } from "./enums";
import { workspaces } from "./workspaces";
import { stores } from "./stores";

export const categories = pgTable(
  "categories",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    position: integer("position").default(0).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("categories_ws_slug_idx").on(t.workspaceId, t.slug),
    index("categories_workspace_idx").on(t.workspaceId),
  ],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sku: text("sku"),
    shortDescription: text("short_description"),
    description: text("description"),
    mainImageUrl: text("main_image_url"),
    type: productType("type").default("digital").notNull(),
    status: productStatus("status").default("draft").notNull(),
    /** Preços em centavos */
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    promoPriceCents: bigint("promo_price_cents", { mode: "number" }),
    costCents: bigint("cost_cents", { mode: "number" }),
    currency: text("currency").default("BRL").notNull(),
    taxRatePercent: integer("tax_rate_percent"),
    tags: jsonb("tags").default([]).notNull(),
    /** Físico */
    trackInventory: boolean("track_inventory").default(false).notNull(),
    stockQuantity: integer("stock_quantity").default(0).notNull(),
    minStockAlert: integer("min_stock_alert"),
    weightGrams: integer("weight_grams"),
    dimensions: jsonb("dimensions"),
    /** Digital */
    deliveryUrl: text("delivery_url"),
    downloadLimit: integer("download_limit"),
    /** Pós-compra */
    thankYouPageUrl: text("thank_you_page_url"),
    seo: jsonb("seo").default({}).notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    /**
     * Produto vendido por variações (cor, tamanho, modelo…). Ligado, o preço
     * e o estoque que valem são os de `product_variants` — os campos acima
     * passam a ser apenas o padrão de quem não escolheu nada ainda.
     */
    hasVariants: boolean("has_variants").default(false).notNull(),
    /**
     * Conteúdo rico da landing page (highlights, specs, galeria, avaliações,
     * frete/prazo). Formato livre — ver `LandingContent` em
     * `src/features/landing/types.ts`. Evita normalizar em tabelas próprias
     * enquanto não houver editor visual (Fase 8).
     */
    landingContent: jsonb("landing_content"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("products_ws_slug_idx").on(t.workspaceId, t.slug),
    index("products_workspace_idx").on(t.workspaceId),
    index("products_status_idx").on(t.workspaceId, t.status),
  ],
);

/**
 * Provas sociais (avaliações de clientes) exibidas na landing page.
 *
 * `isVerifiedPurchase` só deve ser marcado quando a avaliação vier de um
 * pedido real (`orderId` preenchido) — o selo "Compra verificada" é uma
 * afirmação legal perante o consumidor.
 */
export const productReviews = pgTable(
  "product_reviews",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Pedido de origem — obrigatório para marcar compra verificada */
    orderId: uuid("order_id"),
    authorName: text("author_name").notNull(),
    location: text("location"),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    photoUrl: text("photo_url"),
    helpfulCount: integer("helpful_count").default(0).notNull(),
    isVerifiedPurchase: boolean("is_verified_purchase")
      .default(false)
      .notNull(),
    isPublished: boolean("is_published").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("product_reviews_product_idx").on(t.productId, t.isPublished),
    index("product_reviews_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * Métodos de envio disponíveis no checkout (ex.: Envio Standard, Expresso).
 * O cliente escolhe um destes durante o checkout — nunca um valor fixo em
 * código.
 */
export const shippingMethods = pgTable(
  "shipping_methods",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Ex.: "3 a 4 dias úteis" */
    deliveryEstimate: text("delivery_estimate").notNull(),
    priceCents: bigint("price_cents", { mode: "number" }).default(0).notNull(),
    currency: text("currency").default("EUR").notNull(),
    country: text("country").default("PT").notNull(),
    /** Grátis quando o subtotal atingir este valor; null = nunca grátis por valor */
    freeAboveCents: bigint("free_above_cents", { mode: "number" }),
    isActive: boolean("is_active").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("shipping_methods_workspace_idx").on(t.workspaceId, t.isActive),
  ],
);

/**
 * Atributo de variação de um produto: "Cor", "Tamanho", "Voltagem"…
 *
 * Nada aqui é fixo em código: o administrador cria os atributos que o
 * produto tiver. Um produto com dois atributos gera a matriz de combinações
 * em `product_variants`.
 */
export const productOptions = pgTable(
  "product_options",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Rótulo mostrado na página: "Cor", "Tamanho" */
    name: text("name").notNull(),
    position: integer("position").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_options_product_name_idx").on(t.productId, t.name),
    index("product_options_product_idx").on(t.productId),
  ],
);

/** Valores possíveis de um atributo: Preto, Azul, Bege, Branco, Rosa… */
export const productOptionValues = pgTable(
  "product_option_values",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    /** Valor cru usado na combinação e na URL pública ("preto") */
    value: text("value").notNull(),
    /** Rótulo mostrado ao cliente quando difere do valor ("Preto fosco") */
    label: text("label"),
    /** Amostra de cor (#RRGGBB) para o seletor em círculos */
    hexColor: text("hex_color"),
    /** Miniatura real da opção — nunca um filtro CSS sobre a foto padrão */
    thumbnailUrl: text("thumbnail_url"),
    position: integer("position").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_option_values_option_value_idx").on(
      t.optionId,
      t.value,
    ),
    index("product_option_values_option_idx").on(t.optionId),
  ],
);

/**
 * Variação vendável: a linha que o checkout revalida e o pedido guarda.
 *
 * `status` é texto com CHECK no banco (active | sold_out | unavailable) em
 * vez de enum do Postgres — assim acrescentar um estado no futuro é um
 * ALTER de constraint, sem reescrever tipo em uso por outras tabelas.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Nome mostrado ao cliente quando difere do interno */
    publicName: text("public_name"),
    /**
     * Identificador público usado em `?variant=` — nunca o UUID interno,
     * para não expor a chave real em anúncios e links partilhados.
     */
    publicId: text("public_id"),
    /** Combinação normalizada ("cor:preto|tamanho:m") — trava duplicadas */
    optionsKey: text("options_key"),
    sku: text("sku"),
    barcode: text("barcode"),
    priceCents: bigint("price_cents", { mode: "number" }),
    compareAtPriceCents: bigint("compare_at_price_cents", { mode: "number" }),
    costCents: bigint("cost_cents", { mode: "number" }),
    currency: text("currency"),
    stockQuantity: integer("stock_quantity").default(0).notNull(),
    trackInventory: boolean("track_inventory").default(true).notNull(),
    allowBackorder: boolean("allow_backorder").default(false).notNull(),
    /** Máximo por pedido; null = usa o limite do checkout */
    purchaseLimit: integer("purchase_limit"),
    status: text("status").default("active").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    weightGrams: integer("weight_grams"),
    dimensions: jsonb("dimensions"),
    mainImageUrl: text("main_image_url"),
    thumbnailUrl: text("thumbnail_url"),
    shareImageUrl: text("share_image_url"),
    hexColor: text("hex_color"),
    attributes: jsonb("attributes").default({}).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /**
     * Variação retirada de venda. Nunca apagamos uma variação já vendida —
     * o pedido antigo continua apontando para ela.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("product_variants_product_idx").on(t.productId),
    index("product_variants_workspace_idx").on(t.workspaceId),
    uniqueIndex("product_variants_public_id_idx").on(t.productId, t.publicId),
  ],
);

/** Ligação variação ↔ valor escolhido em cada atributo. */
export const productVariantValues = pgTable(
  "product_variant_values",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    optionValueId: uuid("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_variant_values_variant_option_idx").on(
      t.variantId,
      t.optionId,
    ),
    index("product_variant_values_variant_idx").on(t.variantId),
  ],
);

/** Galeria própria de cada variação (fotos reais daquela cor). */
export const productVariantMedia = pgTable(
  "product_variant_media",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt"),
    position: integer("position").default(0).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("product_variant_media_variant_idx").on(t.variantId)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt"),
    position: integer("position").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

export const productFiles = pgTable(
  "product_files",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Caminho no Supabase Storage (bucket privado) — nunca URL pública */
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [index("product_files_product_idx").on(t.productId)],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("product_categories_unique_idx").on(t.productId, t.categoryId),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull(), // positivo = entrada, negativo = saída
    reason: text("reason").notNull(), // sale | restock | adjustment | return
    referenceId: uuid("reference_id"), // ex.: order_id
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("inventory_movements_product_idx").on(t.productId)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    type: discountType("type").notNull(),
    /** percentage: valor em % (ex.: 10). fixed: centavos. */
    value: bigint("value", { mode: "number" }).notNull(),
    currency: text("currency").default("BRL").notNull(),
    minOrderCents: bigint("min_order_cents", { mode: "number" }),
    maxUses: integer("max_uses"),
    maxUsesPerCustomer: integer("max_uses_per_customer"),
    usedCount: integer("used_count").default(0).notNull(),
    allowedProductIds: jsonb("allowed_product_ids").default([]).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("coupons_ws_code_idx").on(t.workspaceId, t.code),
    index("coupons_workspace_idx").on(t.workspaceId),
  ],
);

export const couponUses = pgTable(
  "coupon_uses",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    orderId: uuid("order_id"),
    customerId: uuid("customer_id"),
    discountCents: bigint("discount_cents", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [index("coupon_uses_coupon_idx").on(t.couponId)],
);
