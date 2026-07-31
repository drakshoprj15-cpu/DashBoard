import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_helpers";
import { workspaces } from "./workspaces";

/**
 * Identidade da loja usada no checkout público (nome, contacto, país,
 * moeda) — substitui dados fixos no código por algo editável no painel.
 */
export const workspaceBranding = pgTable(
  "workspace_branding",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storeName: text("store_name").default("Minha Loja").notNull(),
    supportEmail: text("support_email"),
    country: text("country").default("PT").notNull(),
    currency: text("currency").default("EUR").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("workspace_branding_workspace_idx").on(t.workspaceId)],
);
