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

/**
 * Landing pages construídas no editor visual (/landing-pages).
 *
 * Separação deliberada entre rascunho e publicado:
 * - `content`, `theme`, `seo`, `tracking` e `customCode` são o **rascunho**,
 *   gravados a cada autosave do editor;
 * - `publishedSnapshot` é a versão **imutável** que a rota pública
 *   `/lp/[slug]` serve. Editar o rascunho nunca altera a página no ar até
 *   alguém publicar.
 *
 * Assim, publicar é uma escrita no banco — não exige novo build da aplicação.
 */
export const landingPages = pgTable(
  "landing_pages",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Nome de controlo interno — nunca aparece para o cliente */
    name: text("name").notNull(),
    /** Nome público da página/loja (cabeçalho, rodapé, títulos) */
    publicName: text("public_name"),
    slug: text("slug").notNull(),
    status: publishStatus("status").default("draft").notNull(),
    template: text("template"),
    /** Documento do editor: `{ blocks: LandingBlock[] }` */
    content: jsonb("content").default({ blocks: [] }).notNull(),
    /** Tema visual (cores, fontes, raio, sombras, largura) */
    theme: jsonb("theme").default({}).notNull(),
    seo: jsonb("seo").default({}).notNull(),
    /** Pixels e UTMs próprios desta página */
    tracking: jsonb("tracking").default({}).notNull(),
    /** Código personalizado (head, body, CSS, JS) — só executa na página pública */
    customCode: jsonb("custom_code").default({}).notNull(),
    productId: uuid("product_id"),
    /** Cópia dos dados do produto quando a sincronização está desligada */
    productSnapshot: jsonb("product_snapshot"),
    /** true = lê sempre do catálogo; false = usa `productSnapshot` */
    productSync: boolean("product_sync").default(true).notNull(),
    checkoutId: uuid("checkout_id"),
    domainId: uuid("domain_id"),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    language: text("language").default("pt-PT").notNull(),
    country: text("country").default("PT").notNull(),
    currency: text("currency").default("EUR").notNull(),
    /** Versão imutável servida em /lp/[slug]; null = nunca publicada */
    publishedSnapshot: jsonb("published_snapshot"),
    publishedVersion: integer("published_version"),
    draftVersion: integer("draft_version").default(0).notNull(),
    publishedBy: uuid("published_by"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Publicação agendada: o snapshot só entra no ar a partir desta data */
    scheduledPublishAt: timestamp("scheduled_publish_at", {
      withTimezone: true,
    }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    /** Token do preview privado da versão em rascunho */
    previewToken: text("preview_token"),
    /** Mensagem do último erro de publicação (status `error` na UI) */
    lastError: text("last_error"),

    /**
     * Hospedagem da página.
     *
     * `infinity` (padrão) é o caminho normal: a rota `/lp/[slug]` desta
     * aplicação serve o snapshot direto do banco. `vercel` é para páginas
     * cujo HTML não nasce do editor — um site exportado, por exemplo —, e que
     * por isso vivem num projeto estático próprio. Nesse caso o painel deixa
     * de ser quem serve a página e passa a ser quem a publica e regista.
     *
     * Campos com nome genérico (`deployment*`) e não `vercel*`: quem diz qual
     * é o serviço é `hostingProvider`, e trocar de serviço não obriga a mexer
     * no schema.
     */
    hostingProvider: text("hosting_provider").default("infinity").notNull(),
    /** Endereço público devolvido pelo serviço (ex.: `https://x.vercel.app`) */
    deploymentUrl: text("deployment_url"),
    /** Identificador do projeto no serviço de hospedagem */
    deploymentProjectId: text("deployment_project_id"),
    /** Identificador do último deploy — serve para abrir o registo no serviço */
    deploymentId: text("deployment_id"),
    /**
     * Fase do último deploy: `idle`, `preparing`, `deploying`, `ready` ou
     * `failed`. Separado de `status` de propósito — uma página pode estar
     * publicada no painel e com o último deploy falhado, e a interface tem de
     * conseguir mostrar as duas coisas.
     */
    deploymentStatus: text("deployment_status").default("idle").notNull(),
    /** Saída técnica do último deploy, guardada para diagnóstico */
    deploymentLog: text("deployment_log"),
    deploymentUpdatedAt: timestamp("deployment_updated_at", {
      withTimezone: true,
    }),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("landing_pages_ws_slug_idx").on(t.workspaceId, t.slug),
    index("landing_pages_workspace_idx").on(t.workspaceId),
    index("landing_pages_status_idx").on(t.workspaceId, t.status),
  ],
);

/**
 * Histórico de publicações. Cada publicação grava um snapshot completo e
 * imutável, o que permite restaurar uma versão anterior sem perder nada.
 */
export const landingPageVersions = pgTable(
  "landing_page_versions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    landingPageId: uuid("landing_page_id")
      .notNull()
      .references(() => landingPages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    /** Resumo do que mudou (ex.: "Publicada por ana@loja.pt") */
    note: text("note"),
    createdBy: uuid("created_by"),
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("landing_page_versions_unique_idx").on(
      t.landingPageId,
      t.version,
    ),
    index("landing_page_versions_page_idx").on(t.landingPageId),
  ],
);

/**
 * Eventos das landing pages públicas (visitas, cliques no CTA, checkout).
 *
 * Tabela própria — e não `analytics_events` — porque estes eventos precisam
 * de ligação direta com a página para as métricas por landing, e o endpoint
 * público que os grava é aberto (com limite de taxa por IP).
 *
 * Privacidade: nunca guarda dado pessoal. `anonymousId` é gerado no
 * navegador e não identifica ninguém.
 */
export const landingPageEvents = pgTable(
  "landing_page_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    landingPageId: uuid("landing_page_id")
      .notNull()
      .references(() => landingPages.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    anonymousId: text("anonymous_id").notNull(),
    valueCents: bigint("value_cents", { mode: "number" }),
    currency: text("currency"),
    deviceType: text("device_type"),
    source: text("source"),
    campaign: text("campaign"),
    properties: jsonb("properties").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("landing_page_events_page_idx").on(t.landingPageId, t.occurredAt),
    index("landing_page_events_name_idx").on(t.landingPageId, t.eventName),
    index("landing_page_events_workspace_idx").on(t.workspaceId),
  ],
);
