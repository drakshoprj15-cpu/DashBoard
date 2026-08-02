import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_helpers";
import { workspaces } from "./workspaces";

/**
 * Identidade da loja usada no checkout público (nome, contacto, país,
 * moeda) — substitui dados fixos no código por algo editável no painel.
 *
 * RLS ativo, mesma postura de 0001_enable_rls.sql: sem policies, o acesso
 * via anon key (embutida no JavaScript do site) é negado por padrão. A
 * aplicação continua a funcionar porque liga como `postgres`, que ignora
 * RLS — toda a leitura/escrita passa pelo servidor via Drizzle.
 */
export const workspaceBranding = pgTable(
  "workspace_branding",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storeName: text("store_name").default("Minha Loja").notNull(),
    logoUrl: text("logo_url"),
    supportEmail: text("support_email"),
    country: text("country").default("PT").notNull(),
    currency: text("currency").default("EUR").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("workspace_branding_workspace_idx").on(t.workspaceId)],
).enableRLS();
