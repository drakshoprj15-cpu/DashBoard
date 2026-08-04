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

import { id, timestamps } from "./_helpers";
import { orderStatus } from "./enums";
import { workspaces } from "./workspaces";
import { customers } from "./customers";
import { checkouts } from "./checkouts";
import { carts } from "./carts";
import { products, productVariants } from "./catalog";

export const orders = pgTable(
  "orders",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Referência curta e legível, ex.: VD-1042 */
    reference: text("reference").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    checkoutId: uuid("checkout_id").references(() => checkouts.id, {
      onDelete: "set null",
    }),
    cartId: uuid("cart_id").references(() => carts.id, {
      onDelete: "set null",
    }),
    paymentLinkId: uuid("payment_link_id"),
    campaignId: uuid("campaign_id"),
    status: orderStatus("status").default("created").notNull(),
    currency: text("currency").default("BRL").notNull(),
    subtotalCents: bigint("subtotal_cents", { mode: "number" })
      .default(0)
      .notNull(),
    discountCents: bigint("discount_cents", { mode: "number" })
      .default(0)
      .notNull(),
    shippingCents: bigint("shipping_cents", { mode: "number" })
      .default(0)
      .notNull(),
    taxCents: bigint("tax_cents", { mode: "number" }).default(0).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).default(0).notNull(),
    couponId: uuid("coupon_id"),
    shippingMethod: text("shipping_method"),
    shippingAddress: jsonb("shipping_address"),
    billingAddress: jsonb("billing_address"),
    /** UTMs e click ids capturados na sessão */
    utm: jsonb("utm").default({}).notNull(),
    origin: text("origin"), // store | checkout | payment_link | landing_page
    /**
     * Atribuição da Meta capturada no momento do checkout (cookies do
     * navegador + IP/UA da requisição) — persistida aqui porque o webhook do
     * gateway não tem acesso a cookies, e o Purchase pode ser enviado bem
     * depois da visita original.
     */
    clientFbp: text("client_fbp"),
    clientFbc: text("client_fbc"),
    clientIp: text("client_ip"),
    clientUserAgent: text("client_user_agent"),
    deviceType: text("device_type"),
    countryCode: text("country_code"),
    internalNotes: text("internal_notes"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Último lembrete de pagamento enviado — evita reenviar em intervalo curto */
    lastReminderSentAt: timestamp("last_reminder_sent_at", {
      withTimezone: true,
    }),
    /** Link para o cliente retomar o pagamento — usado nos lembretes */
    checkoutUrl: text("checkout_url"),
    /** Quantos lembretes já foram disparados (qualquer canal) */
    reminderCount: integer("reminder_count").default(0).notNull(),
    /** email | whatsapp — canal do último lembrete */
    lastReminderChannel: text("last_reminder_channel"),
    /**
     * "Marcar como convertido" feito à mão pelo operador. Deliberadamente
     * separado de `status`: receita em todo o painel é `status in
     * ('paid','shipped','delivered')` e só o webhook do gateway pode gravar
     * isso. Aqui é só uma marcação de recuperação, exibida em Carrinhos e
     * invisível para o Financeiro.
     */
    recoveredManuallyAt: timestamp("recovered_manually_at", {
      withTimezone: true,
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Lote de importação de planilha que originou este registo */
    importBatchId: uuid("import_batch_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_ws_reference_idx").on(t.workspaceId, t.reference),
    index("orders_workspace_idx").on(t.workspaceId),
    index("orders_status_idx").on(t.workspaceId, t.status),
    index("orders_customer_idx").on(t.customerId),
    index("orders_created_idx").on(t.workspaceId, t.createdAt),
    index("orders_archived_idx").on(t.workspaceId, t.archivedAt),
    index("orders_import_batch_idx").on(t.importBatchId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    /** Snapshot do nome no momento da compra */
    productName: text("product_name").notNull(),
    /**
     * Cópia congelada da variação comprada. Editar preço, nome ou imagem no
     * catálogo depois não pode mudar o que o cliente viu e pagou.
     */
    variantName: text("variant_name"),
    /** Ex.: `{ "Cor": "Preto", "Tamanho": "M" }` */
    variantOptions: jsonb("variant_options"),
    sku: text("sku"),
    imageUrl: text("image_url"),
    currency: text("currency"),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    isOrderBump: boolean("is_order_bump").default(false).notNull(),
    /** Entrega digital */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    downloadCount: integer("download_count").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/**
 * Histórico de recuperação de um carrinho. Complementa
 * `order_status_history` (que só regista transições de status) com os eventos
 * operacionais da central de recuperação: lembrete enviado, WhatsApp aberto,
 * importação, exportação e arquivamento.
 *
 * Vive aqui, e não em `carts.ts`, porque aponta para `orders` — os
 * "carrinhos" desta operação são pedidos (ver cabeçalho de
 * `features/carts/queries.ts`) — e `orders.ts` já importa `carts.ts`, então
 * declarar a tabela do outro lado criaria um ciclo de importação.
 */
export const cartEvents = pgTable(
  "cart_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** created | status_changed | email_sent | whatsapp_opened | imported | exported | archived | reminder_failed */
    type: text("type").notNull(),
    /** email | whatsapp | null (evento sem canal) */
    channel: text("channel"),
    /** Resumo legível do evento — nunca o corpo da mensagem com dados pessoais */
    message: text("message"),
    metadata: jsonb("metadata").default({}).notNull(),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [
    index("cart_events_order_idx").on(t.orderId, t.createdAt),
    index("cart_events_workspace_idx").on(t.workspaceId, t.type),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    reason: text("reason"),
    changedBy: uuid("changed_by"), // profile id ou null (sistema/webhook)
    metadata: jsonb("metadata").default({}).notNull(),
    ...timestamps,
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId)],
);
