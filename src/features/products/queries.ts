import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { orderItems, orders, products } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { listVariantSummaries } from "@/features/variants/queries";
import type { ProductVariantSummary } from "@/features/variants/types";

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  priceCents: number;
  currency: string;
  mainImageUrl: string | null;
  createdAt: Date;
  /** Métricas reais calculadas a partir dos itens de pedidos pagos */
  orderCount: number;
  revenueCents: number;
  /** Resumo das variações ativas; null quando o produto não usa variações */
  variants: ProductVariantSummary | null;
}

/** Produtos do workspace, com métricas reais de vendas. */
export async function listProducts(): Promise<ProductRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      type: products.type,
      status: products.status,
      priceCents: products.priceCents,
      currency: products.currency,
      mainImageUrl: products.mainImageUrl,
      createdAt: products.createdAt,
      orderCount: sql<number>`count(distinct ${orderItems.orderId}) filter (where ${orders.status} in ('paid','shipped','delivered'))::int`,
      revenueCents: sql<number>`coalesce(sum(${orderItems.totalCents}) filter (where ${orders.status} in ('paid','shipped','delivered')), 0)::int`,
    })
    .from(products)
    .leftJoin(orderItems, eq(orderItems.productId, products.id))
    .leftJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(eq(products.workspaceId, workspaceId), isNull(products.deletedAt)),
    )
    .groupBy(
      products.id,
      products.name,
      products.slug,
      products.type,
      products.status,
      products.priceCents,
      products.currency,
      products.mainImageUrl,
      products.createdAt,
    )
    .orderBy(desc(products.createdAt));

  const summaries = await listVariantSummaries(rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    variants: summaries.get(row.id) ?? null,
  }));
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  priceCents: number;
  currency: string;
  shortDescription: string | null;
  mainImageUrl: string | null;
  trackInventory: boolean;
  stockQuantity: number;
  landingContent: Record<string, unknown> | null;
}

/** Produto completo do workspace, para a página de edição. */
export async function getProductById(
  id: string,
): Promise<ProductDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, id),
        eq(products.workspaceId, workspaceId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    priceCents: row.priceCents,
    currency: row.currency,
    shortDescription: row.shortDescription,
    mainImageUrl: row.mainImageUrl,
    trackInventory: row.trackInventory,
    stockQuantity: row.stockQuantity,
    landingContent:
      row.landingContent && typeof row.landingContent === "object"
        ? (row.landingContent as Record<string, unknown>)
        : null,
  };
}

export interface ProductOption {
  id: string;
  name: string;
  slug: string;
}

/** Produtos disponíveis para associar a um checkout ou avaliação. */
export async function listProductOptions(): Promise<ProductOption[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  return db
    .select({ id: products.id, name: products.name, slug: products.slug })
    .from(products)
    .where(
      and(eq(products.workspaceId, workspaceId), isNull(products.deletedAt)),
    )
    .orderBy(asc(products.name));
}
