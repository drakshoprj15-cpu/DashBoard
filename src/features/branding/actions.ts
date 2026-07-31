"use server";

import { revalidatePath } from "next/cache";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { workspaceBranding } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { brandingSchema } from "@/validations/branding";

export interface BrandingActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function updateBrandingAction(
  _prev: BrandingActionResult | null,
  formData: FormData,
): Promise<BrandingActionResult> {
  const parsed = brandingSchema.safeParse({
    storeName: formData.get("storeName"),
    logoUrl: formData.get("logoUrl") || "",
    supportEmail: formData.get("supportEmail"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const { storeName, logoUrl, supportEmail } = parsed.data;

    await db
      .insert(workspaceBranding)
      .values({
        workspaceId,
        storeName,
        logoUrl: logoUrl || null,
        supportEmail: supportEmail || null,
      })
      .onConflictDoUpdate({
        target: workspaceBranding.workspaceId,
        set: {
          storeName,
          logoUrl: logoUrl || null,
          supportEmail: supportEmail || null,
          updatedAt: new Date(),
        },
      });

    revalidatePath("/configuracoes");
    revalidatePath("/checkout/[slug]", "page");
    revalidatePath("/p/[slug]", "page");

    return { ok: true, message: "Dados da loja atualizados." };
  } catch (error) {
    console.error("[branding] erro ao atualizar:", error);
    return { ok: false, error: "Não foi possível salvar os dados da loja." };
  }
}
