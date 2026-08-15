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

import { id, timestamps } from "./_helpers";
import {
  environment,
  integrationCategory,
  integrationDeliveryStatus,
  integrationStatus,
  webhookDeliveryStatus,
} from "./enums";
import { workspaces } from "./workspaces";
import { orders } from "./orders";

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Identificador do adapter: utmify | resend | meta_capi | ... */
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: integrationCategory("category").notNull(),
    status: integrationStatus("status").default("disconnected").notNull(),
    environment: environment("environment").default("production").notNull(),
    /** Credenciais criptografadas com ENCRYPTION_KEY */
    encryptedCredentials: text("encrypted_credentials"),
    config: jsonb("config").default({}).notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    connectionStatus: text("connection_status").default("not_tested").notNull(),
    lastConnectionTestAt: timestamp("last_connection_test_at", {
      withTimezone: true,
    }),
    lastConnectionOk: boolean("last_connection_ok"),
    lastConnectionHttpStatus: integer("last_connection_http_status"),
    lastConnectionMessage: text("last_connection_message"),
    lastConnectionDurationMs: integer("last_connection_duration_ms"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("integrations_ws_key_idx").on(t.workspaceId, t.key),
    index("integrations_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * Outbox persistente das integrações server-side. O payload é reconstruído
 * a partir do pedido no envio para não guardar uma segunda cópia de PII.
 */
export const integrationDeliveries = pgTable(
  "integration_deliveries",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    saleStatus: text("sale_status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: integrationDeliveryStatus("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(6).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockToken: text("lock_token"),
    httpStatus: integer("http_status"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("integration_deliveries_order_status_idx").on(
      t.workspaceId,
      t.integrationId,
      t.orderId,
      t.saleStatus,
    ),
    uniqueIndex("integration_deliveries_idempotency_idx").on(t.idempotencyKey),
    index("integration_deliveries_queue_idx").on(t.status, t.nextAttemptAt),
    index("integration_deliveries_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

/** Histórico imutável e sanitizado de cada tentativa da outbox. */
export const integrationDeliveryAttempts = pgTable(
  "integration_delivery_attempts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => integrationDeliveries.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    result: text("result").notNull(),
    httpStatus: integer("http_status"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("integration_delivery_attempts_delivery_idx").on(
      t.deliveryId,
      t.attemptNumber,
    ),
    index("integration_delivery_attempts_workspace_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
  ],
);

export const integrationLogs = pgTable(
  "integration_logs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").references(() => integrations.id, {
      onDelete: "cascade",
    }),
    integrationKey: text("integration_key").notNull(),
    /** request | response | error | info */
    level: text("level").default("info").notNull(),
    action: text("action").notNull(),
    message: text("message"),
    /** Dados mascarados — nunca tokens/credenciais em texto puro */
    data: jsonb("data").default({}).notNull(),
    durationMs: integer("duration_ms"),
    ...timestamps,
  },
  (t) => [
    index("integration_logs_ws_idx").on(t.workspaceId, t.createdAt),
    index("integration_logs_integration_idx").on(t.integrationId),
  ],
);

/**
 * Endpoints de webhook de saída configurados pelo usuário.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** Segredo para assinatura HMAC dos payloads enviados */
    encryptedSecret: text("encrypted_secret"),
    /** Eventos assinados: order.created, payment.approved, ... */
    events: jsonb("events").default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("webhook_endpoints_ws_idx").on(t.workspaceId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    /** Chave de idempotência do evento */
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    status: webhookDeliveryStatus("status").default("pending").notNull(),
    httpStatus: integer("http_status"),
    responseBody: text("response_body"),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    orderId: uuid("order_id"),
    ...timestamps,
  },
  (t) => [
    index("webhook_deliveries_endpoint_idx").on(t.endpointId),
    uniqueIndex("webhook_deliveries_idempotency_idx").on(
      t.endpointId,
      t.idempotencyKey,
    ),
    index("webhook_deliveries_retry_idx").on(t.status, t.nextRetryAt),
  ],
);
