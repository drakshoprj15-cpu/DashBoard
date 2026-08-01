"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { productCustomCode, products } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { customCodeSchema } from "@/validations/custom-code";

export interface CustomCodeActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  updatedAt?: string;
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Salva o Meta Pixel e o código personalizado de um produto.
 *
 * A propriedade do produto é sempre reconferida contra o workspace da
 * sessão antes de gravar — trocar o `id` no formulário não dá acesso ao
 * código de um produto de outro workspace.
 */
export async function saveCustomCodeAction(
  _prev: CustomCodeActionResult | null,
  formData: FormData,
): Promise<CustomCodeActionResult> {
  const parsed = customCodeSchema.safeParse({
    id: formData.get("id"),
    metaPixelId: str(formData, "metaPixelId"),
    metaPixelEnabled: formData.get("metaPixelEnabled") === "on",
    customHeadCode: str(formData, "customHeadCode"),
    customBodyStartCode: str(formData, "customBodyStartCode"),
    customBodyEndCode: str(formData, "customBodyEndCode"),
    customCss: str(formData, "customCss"),
    customJavaScript: str(formData, "customJavaScript"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "Banco de dados não configurado — não é possível salvar o código.",
    };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const { id: productId, ...data } = parsed.data;

    const [product] = await db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.workspaceId, workspaceId)),
      )
      .limit(1);

    if (!product) {
      return { ok: false, error: "Produto não encontrado." };
    }

    const values = {
      metaPixelId: data.metaPixelId || null,
      metaPixelEnabled: data.metaPixelEnabled ?? false,
      customHeadCode: data.customHeadCode || null,
      customBodyStartCode: data.customBodyStartCode || null,
      customBodyEndCode: data.customBodyEndCode || null,
      customCss: data.customCss || null,
      customJavaScript: data.customJavaScript || null,
      updatedAt: new Date(),
    };

    const [row] = await db
      .insert(productCustomCode)
      .values({ workspaceId, productId, ...values })
      .onConflictDoUpdate({
        target: productCustomCode.productId,
        set: values,
      })
      .returning({ updatedAt: productCustomCode.updatedAt });

    revalidatePath(`/catalogo/produtos/${productId}`);
    revalidatePath(`/p/${product.slug}`);

    return {
      ok: true,
      message: "Código salvo com sucesso.",
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("[custom-code] erro ao salvar:", error);
    return { ok: false, error: "Não foi possível salvar o código." };
  }
}
