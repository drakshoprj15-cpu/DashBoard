import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps, softDelete } from "./_helpers";
import { products } from "./catalog";
import { workspaces } from "./workspaces";

export const customers = pgTable(
  "customers",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email"),
    emailStatus: text("email_status").default("unknown").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    normalizedPhone: text("normalized_phone"),
    phoneCountryCode: text("phone_country_code"),
    /** Documento (CPF/NIF) — armazenado, mas mascarado na UI para suporte */
    document: text("document"),
    country: text("country"),
    source: text("source").default("unknown").notNull(),
    /**
     * Produto declarado numa importação de contatos. Não cria pedido nem
     * comprova pagamento; o nome fica congelado para preservar a origem.
     */
    importedProductId: uuid("imported_product_id").references(
      () => products.id,
      { onDelete: "set null" },
    ),
    importedProductName: text("imported_product_name"),
    firstSource: text("first_source"),
    firstLandingPageId: uuid("first_landing_page_id"),
    lastLandingPageId: uuid("last_landing_page_id"),
    tags: jsonb("tags").default([]).notNull(),
    notes: text("notes"),
    isBlocked: boolean("is_blocked").default(false).notNull(),
    /** Bloqueio de comunicação (marketing) */
    marketingOptOut: boolean("marketing_opt_out").default(false).notNull(),
    acceptsEmail: boolean("accepts_email").default(false).notNull(),
    acceptsSms: boolean("accepts_sms").default(false).notNull(),
    acceptsWhatsapp: boolean("accepts_whatsapp").default(false).notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    firstPurchaseAt: timestamp("first_purchase_at", { withTimezone: true }),
    lastPurchaseAt: timestamp("last_purchase_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("customers_ws_email_idx").on(t.workspaceId, t.email),
    index("customers_workspace_idx").on(t.workspaceId),
    index("customers_imported_product_idx").on(
      t.workspaceId,
      t.importedProductId,
    ),
    uniqueIndex("customers_ws_normalized_email_idx").on(
      t.workspaceId,
      t.normalizedEmail,
    ),
    index("customers_normalized_phone_idx").on(
      t.workspaceId,
      t.normalizedPhone,
    ),
    index("customers_last_activity_idx").on(t.workspaceId, t.lastActivityAt),
    index("customers_created_idx").on(t.workspaceId, t.createdAt),
    index("customers_first_landing_idx").on(
      t.workspaceId,
      t.firstLandingPageId,
    ),
    index("customers_last_landing_idx").on(t.workspaceId, t.lastLandingPageId),
  ],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"),
    country: text("country").notNull(),
    state: text("state"),
    city: text("city"),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    postalCode: text("postal_code"),
    isDefault: boolean("is_default").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)],
);

export const customerConsents = pgTable(
  "customer_consents",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** marketing_email | cart_recovery | cookies | terms */
    type: text("type").notNull(),
    granted: boolean("granted").notNull(),
    source: text("source"), // checkout | store | import
    ipMasked: text("ip_masked"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("customer_consents_customer_idx").on(t.customerId)],
);

export const customerTags = pgTable(
  "customer_tags",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("pink").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customer_tags_ws_name_idx").on(t.workspaceId, t.name),
    index("customer_tags_workspace_idx").on(t.workspaceId),
  ],
);

export const customerTagAssignments = pgTable(
  "customer_tag_assignments",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => customerTags.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customer_tag_assignments_unique_idx").on(
      t.customerId,
      t.tagId,
    ),
    index("customer_tag_assignments_customer_idx").on(t.customerId),
    index("customer_tag_assignments_tag_idx").on(t.tagId),
  ],
);

export const customerNotes = pgTable(
  "customer_notes",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [
    index("customer_notes_customer_idx").on(t.customerId, t.createdAt),
    index("customer_notes_workspace_idx").on(t.workspaceId),
  ],
);

export const customerActivities = pgTable(
  "customer_activities",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    source: text("source"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    metadata: jsonb("metadata").default({}).notNull(),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [
    index("customer_activities_customer_idx").on(t.customerId, t.createdAt),
    index("customer_activities_workspace_idx").on(t.workspaceId, t.type),
  ],
);

export const customerSegments = pgTable(
  "customer_segments",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").default("dynamic").notNull(),
    rules: jsonb("rules").default({}).notNull(),
    estimatedCount: text("estimated_count"),
    createdBy: uuid("created_by"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("customer_segments_ws_name_idx").on(t.workspaceId, t.name),
    index("customer_segments_workspace_idx").on(t.workspaceId),
  ],
);
