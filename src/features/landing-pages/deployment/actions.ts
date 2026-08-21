"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { landingPages } from "@/database/schema";
import { recordAuditLog } from "@/features/audit/log";
import { requireWorkspaceAccess } from "@/lib/workspace-access";

import type { LandingActionResult } from "../actions";
import { deployStaticSite, isVercelConfigured } from "./vercel";

/**
 * Publica na Vercel a landing page hospedada fora do editor.
 *
 * Só faz sentido para páginas com `hostingProvider = "vercel"`: as restantes
 * são servidas pela rota `/lp/[slug]` desta aplicação e publicam-se com uma
 * escrita no banco, sem deploy nenhum. Chamar isto sobre uma delas devolve
 * erro em vez de criar um projeto solto na conta.
 */
export async function deployLandingPageAction(
  formData: FormData,
): Promise<LandingActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Página inválida." };

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }
  if (!isVercelConfigured()) {
    return {
      ok: false,
      error:
        "Falta a variável VERCEL_TOKEN no servidor. Sem ela o painel não consegue publicar na Vercel.",
    };
  }

  const db = getDb();

  // A mesma verificação de acesso do resto do painel: publicar é escrita, e
  // uma página de outro workspace nem sequer é encontrada por esta consulta.
  const { workspaceId, userId, demoMode } = await requireWorkspaceAccess([
    "owner",
    "admin",
  ]);

  const [page] = await db
    .select({
      id: landingPages.id,
      name: landingPages.name,
      slug: landingPages.slug,
      hostingProvider: landingPages.hostingProvider,
      deploymentId: landingPages.deploymentId,
      deploymentProjectId: landingPages.deploymentProjectId,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .limit(1);

  if (!page) return { ok: false, error: "Landing page não encontrada." };

  if (page.hostingProvider !== "vercel") {
    return {
      ok: false,
      error:
        "Esta página é servida pelo próprio Infinity — publique-a pelo botão “Publicar”, sem deploy.",
    };
  }

  // Marca o início antes de sair para a rede: se o processo morrer a meio, a
  // interface mostra "Fazendo deploy" e não um estado antigo que mente.
  await db
    .update(landingPages)
    .set({
      deploymentStatus: "deploying",
      deploymentUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, page.id));

  revalidatePath("/landing-pages");

  const projectName = `infinity-lp-${page.slug}`;
  const result = await deployStaticSite({
    projectName,
    slug: page.slug,
  });

  const now = new Date();

  if (!result.ok) {
    // Um deploy que ainda constrói não é um deploy falhado: marcar "com erro"
    // faria o cartão desmentir uma página que segundos depois está no ar.
    await db
      .update(landingPages)
      .set({
        deploymentStatus: result.pending ? "deploying" : "failed",
        deploymentId: result.deploymentId ?? page.deploymentId,
        deploymentProjectId: result.projectId ?? page.deploymentProjectId,
        deploymentLog: result.log || null,
        deploymentUpdatedAt: now,
        lastError: result.pending ? null : (result.error ?? "Falha no deploy."),
        updatedAt: now,
      })
      .where(eq(landingPages.id, page.id));

    revalidatePath("/landing-pages");
    return { ok: false, error: result.error ?? "Falha no deploy." };
  }

  await db
    .update(landingPages)
    .set({
      status: "published",
      deploymentStatus: "ready",
      deploymentUrl: result.url ?? null,
      deploymentId: result.deploymentId ?? null,
      deploymentProjectId: result.projectId ?? page.deploymentProjectId,
      deploymentLog: result.log || null,
      deploymentUpdatedAt: now,
      publishedAt: now,
      // No modo demonstração o identificador não corresponde a um perfil real.
      publishedBy: demoMode ? null : userId,
      pausedAt: null,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(landingPages.id, page.id));

  await recordAuditLog({
    action: "landing_page.deployed",
    entityType: "landing_page",
    entityId: page.id,
    changes: {
      provider: "vercel",
      url: result.url,
      deploymentId: result.deploymentId,
    },
  });

  revalidatePath("/landing-pages");
  revalidatePath(`/landing-pages/${page.id}`);

  return {
    ok: true,
    message: `Publicada em ${result.url}`,
  };
}
