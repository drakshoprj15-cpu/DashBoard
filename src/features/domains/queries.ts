import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { domains, products } from "@/database/schema";
import { normalizeHost } from "@/lib/hosts";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface DomainRow {
  id: string;
  hostname: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

/** Domínios do workspace, com o produto servido na raiz de cada um. */
export async function listDomains(): Promise<DomainRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  return db
    .select({
      id: domains.id,
      hostname: domains.hostname,
      productId: domains.productId,
      productName: products.name,
      productSlug: products.slug,
      isVerified: domains.isVerified,
      verifiedAt: domains.verifiedAt,
      isActive: domains.isActive,
      createdAt: domains.createdAt,
    })
    .from(domains)
    .leftJoin(products, eq(products.id, domains.productId))
    .where(eq(domains.workspaceId, workspaceId))
    .orderBy(asc(domains.hostname));
}

export interface ResolvedDomain {
  hostname: string;
  productSlug: string | null;
}

/**
 * Resolve um host de requisição para o produto que ele serve na raiz.
 *
 * Sem filtro de workspace de propósito: `hostname` é único no banco inteiro,
 * e quem chama é a rota pública, que não tem sessão.
 */
export async function getDomainByHost(
  host: string,
): Promise<ResolvedDomain | null> {
  if (!isDatabaseConfigured()) return null;

  const hostname = normalizeHost(host);
  if (!hostname) return null;

  try {
    const db = getDb();
    const [row] = await db
      .select({
        hostname: domains.hostname,
        productSlug: products.slug,
        productStatus: products.status,
        productDeletedAt: products.deletedAt,
      })
      .from(domains)
      .leftJoin(products, eq(products.id, domains.productId))
      .where(and(eq(domains.hostname, hostname), eq(domains.isActive, true)))
      .limit(1);

    if (!row) return null;

    // Produto rascunho ou removido não é servido — o domínio responde, mas
    // sem landing na raiz.
    const servesProduct =
      row.productSlug &&
      row.productStatus === "active" &&
      row.productDeletedAt === null;

    return {
      hostname: row.hostname,
      productSlug: servesProduct ? row.productSlug : null,
    };
  } catch (error) {
    console.error("[domains] erro ao resolver host:", error);
    return null;
  }
}

/**
 * Domínio próprio, verificado e ativo, de um produto — usado para redirecionar
 * o link antigo `/p/[slug]` do domínio do painel para o domínio da loja.
 *
 * Só devolve domínios verificados: enviar tráfego para um domínio que ainda
 * não resolve seria pior do que servir a página no endereço antigo.
 */
export async function getVerifiedDomainForProductSlug(
  slug: string,
): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    const db = getDb();
    const [row] = await db
      .select({ hostname: domains.hostname })
      .from(domains)
      .innerJoin(products, eq(products.id, domains.productId))
      .where(
        and(
          eq(products.slug, slug),
          isNull(products.deletedAt),
          eq(domains.isActive, true),
          eq(domains.isVerified, true),
        ),
      )
      .limit(1);

    return row?.hostname ?? null;
  } catch (error) {
    console.error("[domains] erro ao buscar domínio do produto:", error);
    return null;
  }
}
