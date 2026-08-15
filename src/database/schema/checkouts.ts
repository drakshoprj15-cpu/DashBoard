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
import { publishStatus } from "./enums";
import { workspaces } from "./workspaces";
import { products } from "./catalog";
import { domains } from "./domains";

export const checkouts = pgTable(
  "checkouts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: publishStatus("status").default("draft").notNull(),
    mainProductId: uuid("main_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    gatewayAccountId: uuid("gateway_account_id"),
    currency: text("currency").default("BRL").notNull(),
    country: text("country").default("BR").notNull(),
    locale: text("locale").default("pt-BR").notNull(),
    /** single_page | multi_step */
    layoutType: text("layout_type").default("single_page").notNull(),
    /** Campos, aparência, conteúdo, frete, seo etc. do editor */
    config: jsonb("config").default({}).notNull(),
    paymentMethods: jsonb("payment_methods").default([]).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("checkouts_ws_slug_idx").on(t.workspaceId, t.slug),
    index("checkouts_workspace_idx").on(t.workspaceId),
  ],
);

export const checkoutVersions = pgTable(
  "checkout_versions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    checkoutId: uuid("checkout_id")
      .notNull()
      .references(() => checkouts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(),
    createdBy: uuid("created_by"),
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("checkout_versions_unique_idx").on(t.checkoutId, t.version),
  ],
);

export const checkoutProducts = pgTable(
  "checkout_products",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    checkoutId: uuid("checkout_id")
      .notNull()
      .references(() => checkouts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Sobrescreve o preço do produto neste checkout, se definido */
    priceOverrideCents: bigint("price_override_cents", { mode: "number" }),
    position: integer("position").default(0).notNull(),
  },
  (t) => [
    uniqueIndex("checkout_products_unique_idx").on(t.checkoutId, t.productId),
  ],
);

export const orderBumps = pgTable(
  "order_bumps",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    checkoutId: uuid("checkout_id")
      .notNull()
      .references(() => checkouts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    ctaText: text("cta_text"),
    position: integer("position").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("order_bumps_checkout_idx").on(t.checkoutId)],
);

/**
 * Link de pagamento: uma página de cobrança própria, com valor fixo, servida
 * em `/pagar/[slug]`.
 *
 * O pagamento em si NÃO vive aqui. Cada tentativa de cobrança cria um
 * `orders` (com `payment_link_id` preenchido) e um `payments` — as mesmas
 * tabelas do checkout da loja. É isso que faz o webhook do gateway, o
 * livro-caixa, o CRM de clientes e o Dashboard funcionarem para links de
 * pagamento sem uma segunda implementação paralela de cada um.
 */
export const paymentLinks = pgTable(
  "payment_links",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /**
     * Token público da URL. Único no banco inteiro, e não por workspace: a
     * página pública é resolvida sem sessão, só pelo slug.
     */
    slug: text("slug").notNull(),
    /** Nome interno — aparece só no painel, nunca ao comprador */
    name: text("name").default("").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    /**
     * Cópia congelada do produto no momento da criação (nome, imagem,
     * descrição, preço unitário). A página pública lê daqui — apagar o
     * produto do catálogo depois não pode quebrar um link já partilhado.
     */
    productSnapshot: jsonb("product_snapshot"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    currency: text("currency").default("EUR").notNull(),
    gatewayAccountId: uuid("gateway_account_id"),
    /** Estado editorial; publicar cria um snapshot imutável para a rota pública. */
    status: publishStatus("status").default("draft").notNull(),
    paymentMethods: jsonb("payment_methods").default([]).notNull(),
    couponId: uuid("coupon_id"),
    /** required | optional | hidden — o que é pedido ao comprador */
    requestName: text("request_name").default("required").notNull(),
    requestEmail: text("request_email").default("required").notNull(),
    requestPhone: text("request_phone").default("optional").notNull(),
    requiresAddress: boolean("requires_address").default(false).notNull(),
    /** Pede escolha de envio; opções em `shippingOptions` */
    requestShipping: boolean("request_shipping").default(false).notNull(),
    /** [{ id, name, estimate, priceCents }] — o frete é somado no servidor */
    shippingOptions: jsonb("shipping_options").default([]).notNull(),
    /** Aparência da página pública */
    logoUrl: text("logo_url"),
    /** Marca, layout e tokens visuais completos do editor. */
    brandConfig: jsonb("brand_config").default({}).notNull(),
    appearanceConfig: jsonb("appearance_config").default({}).notNull(),
    /** Campos ordenados e regras required/optional/hidden. */
    customerFields: jsonb("customer_fields").default([]).notNull(),
    /** Conteúdo pós-confirmação e metadados da aba/SEO. */
    successConfig: jsonb("success_config").default({}).notNull(),
    seoConfig: jsonb("seo_config").default({}).notNull(),
    buttonColor: text("button_color").default("#E5097F").notNull(),
    buttonTextColor: text("button_text_color").default("#FFFFFF").notNull(),
    borderColor: text("border_color").default("#E5E7EB").notNull(),
    /** light | dark */
    backgroundStyle: text("background_style").default("light").notNull(),
    borderRadius: integer("border_radius").default(12).notNull(),
    buttonText: text("button_text").default("Pagar").notNull(),
    /** Domínio próprio que serve o link; null = domínio principal */
    domainId: uuid("domain_id").references(() => domains.id, {
      onDelete: "set null",
    }),
    /** Envia ViewContent/InitiateCheckout/Purchase pelo pixel do workspace */
    metaPixelEnabled: boolean("meta_pixel_enabled").default(true).notNull(),
    successUrl: text("success_url"),
    cancelUrl: text("cancel_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Máximo de pagamentos aprovados; null = ilimitado */
    maxPayments: integer("max_payments"),
    /** Configuração exata servida ao comprador; o rascunho não altera a URL no ar. */
    publishedSnapshot: jsonb("published_snapshot"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("payment_links_slug_idx").on(t.slug),
    index("payment_links_workspace_idx").on(t.workspaceId),
    index("payment_links_ws_active_idx").on(t.workspaceId, t.isActive),
    index("payment_links_ws_status_idx").on(t.workspaceId, t.status),
    index("payment_links_domain_idx").on(t.domainId),
  ],
);

/**
 * Funil de cada link: visita, formulário iniciado, pagamento criado e o
 * desfecho reportado pelo gateway.
 *
 * Tabela própria (e não `analytics_events`) porque estas métricas são por
 * link e precisam de índice por `payment_link_id` — juntar no feed genérico
 * do Live View obrigaria a varrer todos os eventos do workspace.
 */
export const paymentLinkEvents = pgTable(
  "payment_link_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    paymentLinkId: uuid("payment_link_id")
      .notNull()
      .references(() => paymentLinks.id, { onDelete: "cascade" }),
    /** Pedido gerado, quando o evento já tem cobrança associada */
    orderId: uuid("order_id"),
    /** view | form_started | payment_started | payment_pending | payment_paid | payment_failed */
    type: text("type").notNull(),
    /** mbway | multibanco | null */
    method: text("method"),
    /** Identificador anónimo da sessão; permite deduplicar refreshes. */
    visitorKey: text("visitor_key"),
    valueCents: bigint("value_cents", { mode: "number" }),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("payment_link_events_link_idx").on(t.paymentLinkId, t.type),
    index("payment_link_events_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("payment_link_events_order_idx").on(t.orderId),
    uniqueIndex("payment_link_events_visitor_type_idx").on(
      t.paymentLinkId,
      t.type,
      t.visitorKey,
    ),
  ],
);
