import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_helpers";
import { products } from "./catalog";
import { workspaces } from "./workspaces";

/**
 * Configuração de código por produto/landing page: Meta Pixel rápido +
 * código personalizado (head, início/fim do body, CSS, JS).
 *
 * Um-para-um com `products` (unique em `product_id`) — cada produto tem no
 * máximo uma linha aqui, e apagar o produto apaga a configuração junto.
 * Nunca guarda segredos: o Meta Pixel client-side usa só o ID público (o
 * token da Conversions API, esse sim sensível, continua em `pixels`).
 */
export const productCustomCode = pgTable(
  "product_custom_code",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** ID público do Meta Pixel (15–16 dígitos) — não é segredo */
    metaPixelId: text("meta_pixel_id"),
    metaPixelEnabled: boolean("meta_pixel_enabled").default(false).notNull(),
    /** Injetado o mais cedo possível na página pública deste produto */
    customHeadCode: text("custom_head_code"),
    /** Injetado logo após a abertura do <body> */
    customBodyStartCode: text("custom_body_start_code"),
    /** Injetado antes do fechamento do </body> */
    customBodyEndCode: text("custom_body_end_code"),
    customCss: text("custom_css"),
    customJavaScript: text("custom_javascript"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_custom_code_product_idx").on(t.productId),
    index("product_custom_code_workspace_idx").on(t.workspaceId),
  ],
);
