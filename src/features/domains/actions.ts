"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { domains } from "@/database/schema";
import { DOMAIN_CHECK_TOKEN } from "@/features/domains/constants";
import { requireWorkspaceAccess } from "@/lib/workspace-access";
import { domainSchema } from "@/validations/domain";

export interface DomainActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Revalida as duas páginas que mostram domínios. */
function revalidateDomainPages() {
  revalidatePath("/landing-pages/dominios");
  revalidatePath("/landing-pages");
  revalidatePath("/financeiro/links-de-pagamento");
}

/**
 * Cadastra um domínio próprio ou atualiza o produto servido na raiz dele.
 *
 * O `hostname` é único no banco inteiro (um domínio só pode apontar para uma
 * loja), então uma tentativa de cadastrar domínio já usado devolve erro claro
 * em vez de estourar a constraint.
 */
export async function saveDomainAction(
  _prev: DomainActionResult | null,
  formData: FormData,
): Promise<DomainActionResult> {
  const parsed = domainSchema.safeParse({
    hostname: formData.get("hostname"),
    productId: formData.get("productId") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const { workspaceId } = await requireWorkspaceAccess(["owner", "admin"]);
    const { hostname, productId } = parsed.data;

    const [existing] = await db
      .select({ id: domains.id, workspaceId: domains.workspaceId })
      .from(domains)
      .where(eq(domains.hostname, hostname))
      .limit(1);

    if (existing && existing.workspaceId !== workspaceId) {
      return { ok: false, error: "Este domínio já está em uso." };
    }

    if (existing) {
      await db
        .update(domains)
        .set({ productId, isActive: true, updatedAt: new Date() })
        .where(eq(domains.id, existing.id));

      revalidateDomainPages();
      return { ok: true, message: `${hostname} atualizado.` };
    }

    await db.insert(domains).values({ workspaceId, hostname, productId });

    revalidateDomainPages();
    return {
      ok: true,
      message: `${hostname} cadastrado. Aponte o DNS e clique em Verificar.`,
    };
  } catch (error) {
    console.error("[domains] erro ao guardar:", error);
    return { ok: false, error: "Não foi possível guardar o domínio." };
  }
}

/**
 * Confere se o domínio já responde por esta aplicação.
 *
 * Faz uma chamada real ao próprio domínio: se o endpoint público devolver a
 * assinatura da aplicação, o DNS propagou e o certificado está emitido. Nada
 * é marcado como verificado sem essa resposta.
 */
export async function verifyDomainAction(
  _prev: DomainActionResult | null,
  formData: FormData,
): Promise<DomainActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) {
    return { ok: false, error: "Domínio inválido." };
  }

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess(["owner", "admin"]);

  const [row] = await db
    .select({ hostname: domains.hostname })
    .from(domains)
    .where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId)))
    .limit(1);

  if (!row) return { ok: false, error: "Domínio não encontrado." };

  let verified = false;
  try {
    const response = await fetch(
      `https://${row.hostname}/api/public/domain-check`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    const body = (await response.json().catch(() => null)) as {
      app?: string;
    } | null;
    verified = response.ok && body?.app === DOMAIN_CHECK_TOKEN;
  } catch (error) {
    console.error("[domains] verificação falhou:", error);
  }

  await db
    .update(domains)
    .set({
      isVerified: verified,
      verifiedAt: verified ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(domains.id, id));

  revalidateDomainPages();

  return verified
    ? { ok: true, message: `${row.hostname} está a responder por esta loja.` }
    : {
        ok: false,
        error: `${row.hostname} ainda não responde. Confirme o DNS e o domínio na Vercel — a propagação pode levar alguns minutos.`,
      };
}

/** Liga/desliga o domínio sem apagar o cadastro. */
export async function toggleDomainAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess(["owner", "admin"]);

  await db
    .update(domains)
    .set({ isActive: next, updatedAt: new Date() })
    .where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId)));

  revalidateDomainPages();
}

/** Remove o cadastro do domínio (o domínio em si continua seu). */
export async function deleteDomainAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess(["owner", "admin"]);

  await db
    .delete(domains)
    .where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId)));

  revalidateDomainPages();
}
