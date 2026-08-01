import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_helpers";
import { workspaces } from "./workspaces";
import { stores } from "./stores";
import { products } from "./catalog";

/**
 * Domínios próprios apontados para a aplicação.
 *
 * Cada domínio isola uma loja do domínio do painel: o cliente final nunca vê
 * o endereço administrativo, e um bloqueio na loja não derruba o painel.
 *
 * Com `productId` preenchido, a raiz do domínio serve a landing page desse
 * produto (ver `src/app/page.tsx`). Sem produto, o domínio apenas responde
 * às rotas públicas (`/p/`, `/checkout/`...).
 *
 * Fica em arquivo próprio — e não em `stores.ts` — porque `catalog.ts` já
 * importa `stores.ts`, e a referência a `products` criaria import circular.
 */
export const domains = pgTable(
  "domains",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    /** Produto servido na raiz do domínio (null = só rotas públicas) */
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    hostname: text("hostname").notNull(),
    /** Confirmado como apontando para esta aplicação (ver verifyDomainAction) */
    isVerified: boolean("is_verified").default(false).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("domains_hostname_idx").on(t.hostname),
    index("domains_workspace_idx").on(t.workspaceId),
  ],
);
