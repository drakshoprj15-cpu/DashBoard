import { cache } from "react";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { productCustomCode } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface CustomCodeRow {
  metaPixelId: string;
  metaPixelEnabled: boolean;
  customHeadCode: string;
  customBodyStartCode: string;
  customBodyEndCode: string;
  customCss: string;
  customJavaScript: string;
  updatedAt: Date | null;
}

const EMPTY_CUSTOM_CODE: CustomCodeRow = {
  metaPixelId: "",
  metaPixelEnabled: false,
  customHeadCode: "",
  customBodyStartCode: "",
  customBodyEndCode: "",
  customCss: "",
  customJavaScript: "",
  updatedAt: null,
};

/** Configuração de código de um produto, para a aba "Código" no painel. */
export async function getCustomCodeByProductId(
  productId: string,
): Promise<CustomCodeRow> {
  if (!isDatabaseConfigured()) return EMPTY_CUSTOM_CODE;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .select()
    .from(productCustomCode)
    .where(
      and(
        eq(productCustomCode.productId, productId),
        eq(productCustomCode.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) return EMPTY_CUSTOM_CODE;

  return {
    metaPixelId: row.metaPixelId ?? "",
    metaPixelEnabled: row.metaPixelEnabled,
    customHeadCode: row.customHeadCode ?? "",
    customBodyStartCode: row.customBodyStartCode ?? "",
    customBodyEndCode: row.customBodyEndCode ?? "",
    customCss: row.customCss ?? "",
    customJavaScript: row.customJavaScript ?? "",
    updatedAt: row.updatedAt,
  };
}

export interface PublicCustomCode {
  metaPixelId: string | null;
  metaPixelEnabled: boolean;
  customHeadCode: string;
  customBodyStartCode: string;
  customBodyEndCode: string;
  customCss: string;
  customJavaScript: string;
}

/**
 * Código do produto para injeção na landing page pública.
 *
 * Sem filtro de workspace de propósito (mesmo padrão de
 * `getVerifiedDomainForProductSlug`): quem chama é a rota pública, que já
 * resolveu o produto pelo slug antes de chegar aqui. Envolvida em `cache()`
 * porque a mesma requisição injeta o código no topo e no fim da página.
 * Nunca lança — uma falha aqui não pode derrubar a landing page.
 */
export const getActiveCustomCodeForPublic = cache(
  async function getActiveCustomCodeForPublic(
    productId: string,
  ): Promise<PublicCustomCode | null> {
    if (!productId || !isDatabaseConfigured()) return null;

    try {
      const db = getDb();
      const [row] = await db
        .select()
        .from(productCustomCode)
        .where(eq(productCustomCode.productId, productId))
        .limit(1);

      if (!row) return null;

      const hasContent = Boolean(
        (row.metaPixelEnabled && row.metaPixelId) ||
          row.customHeadCode ||
          row.customBodyStartCode ||
          row.customBodyEndCode ||
          row.customCss ||
          row.customJavaScript,
      );
      if (!hasContent) return null;

      return {
        metaPixelId: row.metaPixelId,
        metaPixelEnabled: row.metaPixelEnabled,
        customHeadCode: row.customHeadCode ?? "",
        customBodyStartCode: row.customBodyStartCode ?? "",
        customBodyEndCode: row.customBodyEndCode ?? "",
        customCss: row.customCss ?? "",
        customJavaScript: row.customJavaScript ?? "",
      };
    } catch (error) {
      console.error("[custom-code] erro ao buscar código do produto:", error);
      return null;
    }
  },
);
