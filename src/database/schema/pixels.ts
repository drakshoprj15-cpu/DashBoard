import {
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
import { environment, pixelConnectionStatus, pixelType } from "./enums";
import { workspaces } from "./workspaces";
import { landingPages } from "./pages";

export const pixels = pgTable(
  "pixels",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /**
     * Landing page à qual este pixel é exclusivo. `null` = pixel global do
     * workspace (fallback quando a landing page não tem pixels próprios).
     */
    landingPageId: uuid("landing_page_id").references(() => landingPages.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    type: pixelType("type").notNull(),
    /** ID público do pixel (ex.: Meta Pixel ID) */
    pixelId: text("pixel_id"),
    /** Token privado criptografado (ex.: CAPI) — nunca exposto no frontend */
    encryptedToken: text("encrypted_token"),
    /** Prévia mascarada do token (ex.: "EAAJ***...X9") — segura para exibir */
    tokenPreview: text("token_preview"),
    /** Código de teste da Meta (Test Events) — nunca usado em envios reais */
    testEventCode: text("test_event_code"),
    connectionStatus: pixelConnectionStatus("connection_status")
      .default("not_tested")
      .notNull(),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    /** Mensagem sanitizada do último teste de conexão — nunca o token */
    lastTestError: text("last_test_error"),
    environment: environment("environment").default("production").notNull(),
    /** Eventos habilitados individualmente */
    enabledEvents: jsonb("enabled_events").default([]).notNull(),
    domains: jsonb("domains").default([]).notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("pixels_workspace_idx").on(t.workspaceId),
    index("pixels_workspace_lp_idx").on(t.workspaceId, t.landingPageId),
  ],
);

/**
 * Vínculo de um pixel a produtos, checkouts ou landing pages.
 */
export const pixelBindings = pgTable(
  "pixel_bindings",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pixelId: uuid("pixel_id")
      .notNull()
      .references(() => pixels.id, { onDelete: "cascade" }),
    /** product | checkout | landing_page | store */
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pixel_bindings_unique_idx").on(
      t.pixelId,
      t.targetType,
      t.targetId,
    ),
  ],
);

/**
 * Log de eventos enviados a cada pixel (com resposta da integração).
 */
export const pixelEvents = pgTable(
  "pixel_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pixelId: uuid("pixel_id")
      .notNull()
      .references(() => pixels.id, { onDelete: "cascade" }),
    /** Landing page de origem do evento (herda do pedido/pixel) */
    landingPageId: uuid("landing_page_id").references(() => landingPages.id, {
      onDelete: "set null",
    }),
    eventName: text("event_name").notNull(),
    /** event_id para deduplicação browser/servidor */
    eventId: text("event_id").notNull(),
    /** browser | server */
    channel: text("channel").notNull(),
    orderId: uuid("order_id"),
    /** generated_order | payment_approved | test | browser | reprocess */
    triggerType: text("trigger_type"),
    status: text("status").default("pending").notNull(), // pending | sent | failed
    httpStatus: integer("http_status"),
    /** fbtrace_id devolvido pela Meta — útil para suporte, sem dado sensível */
    metaTraceId: text("meta_trace_id"),
    retryCount: integer("retry_count").default(0).notNull(),
    errorCode: text("error_code"),
    payloadVersion: text("payload_version").default("v1").notNull(),
    /** Resposta da plataforma, mascarada */
    response: jsonb("response").default({}).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [
    index("pixel_events_pixel_idx").on(t.pixelId),
    uniqueIndex("pixel_events_dedup_idx").on(t.pixelId, t.eventId, t.channel),
    index("pixel_events_workspace_created_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
    index("pixel_events_lp_idx").on(t.landingPageId),
    index("pixel_events_order_idx").on(t.orderId),
  ],
);
