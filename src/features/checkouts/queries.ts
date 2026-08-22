import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { checkouts, orders, products } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { STANDARD_STOREFRONT } from "@/features/storefront/standard-brand";

export interface CheckoutTheme {
  primaryColor: string;
  buttonColor: string;
  /** Cor de fundo do cabeçalho (banner) do checkout público. */
  bannerColor: string;
  /** URL da logo exibida centralizada no cabeçalho. null = usa o nome da loja. */
  logoUrl: string | null;
}

export const DEFAULT_CHECKOUT_THEME: CheckoutTheme = {
  primaryColor: STANDARD_STOREFRONT.primaryColor,
  buttonColor: STANDARD_STOREFRONT.buttonColor,
  bannerColor: "#e30613",
  logoUrl: null,
};

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Extrai o tema de `checkouts.config`, caindo nos padrões quando ausente ou inválido. */
function parseCheckoutTheme(config: unknown): CheckoutTheme {
  if (!config || typeof config !== "object") return DEFAULT_CHECKOUT_THEME;
  const theme = (config as Record<string, unknown>).theme;
  if (!theme || typeof theme !== "object") return DEFAULT_CHECKOUT_THEME;

  const t = theme as Record<string, unknown>;
  const primaryColor =
    typeof t.primaryColor === "string" && HEX_COLOR_REGEX.test(t.primaryColor)
      ? t.primaryColor
      : DEFAULT_CHECKOUT_THEME.primaryColor;
  const buttonColor =
    typeof t.buttonColor === "string" && HEX_COLOR_REGEX.test(t.buttonColor)
      ? t.buttonColor
      : DEFAULT_CHECKOUT_THEME.buttonColor;
  const bannerColor =
    typeof t.bannerColor === "string" && HEX_COLOR_REGEX.test(t.bannerColor)
      ? t.bannerColor
      : DEFAULT_CHECKOUT_THEME.bannerColor;
  const logoUrl =
    typeof t.logoUrl === "string" && t.logoUrl.trim() ? t.logoUrl : null;

  return { primaryColor, buttonColor, bannerColor, logoUrl };
}

export interface CheckoutRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  paymentMethods: string[];
  publishedAt: Date | null;
  createdAt: Date;
  theme: CheckoutTheme;
  /** Métricas reais calculadas a partir dos pedidos */
  orderCount: number;
  paidCount: number;
  revenueCents: number;
}

/** Checkouts do workspace, com métricas reais de pedidos. */
export async function listCheckouts(): Promise<CheckoutRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: checkouts.id,
      name: checkouts.name,
      slug: checkouts.slug,
      status: checkouts.status,
      currency: checkouts.currency,
      productId: checkouts.mainProductId,
      productName: products.name,
      productSlug: products.slug,
      paymentMethods: checkouts.paymentMethods,
      publishedAt: checkouts.publishedAt,
      createdAt: checkouts.createdAt,
      config: checkouts.config,
      orderCount: sql<number>`count(${orders.id})::int`,
      paidCount: sql<number>`count(${orders.id}) filter (where ${orders.status} in ('paid','shipped','delivered'))::int`,
      revenueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','shipped','delivered')), 0)::int`,
    })
    .from(checkouts)
    .leftJoin(products, eq(checkouts.mainProductId, products.id))
    .leftJoin(orders, eq(orders.checkoutId, checkouts.id))
    .where(
      and(eq(checkouts.workspaceId, workspaceId), isNull(checkouts.deletedAt)),
    )
    .groupBy(
      checkouts.id,
      checkouts.name,
      checkouts.slug,
      checkouts.status,
      checkouts.currency,
      checkouts.mainProductId,
      products.name,
      products.slug,
      checkouts.paymentMethods,
      checkouts.publishedAt,
      checkouts.createdAt,
      checkouts.config,
    )
    .orderBy(desc(checkouts.createdAt));

  return rows.map(({ config, ...r }) => ({
    ...r,
    paymentMethods: Array.isArray(r.paymentMethods)
      ? (r.paymentMethods as string[])
      : [],
    theme: parseCheckoutTheme(config),
  }));
}

export interface PublicCheckout {
  id: string;
  slug: string;
  productSlug: string;
  paymentMethods: string[];
  theme: CheckoutTheme;
}

/**
 * Resolve um checkout publicado pelo slug, para a rota pública.
 * Devolve null quando não existe ou não está publicado — nesse caso a
 * rota cai no comportamento antigo (slug do produto).
 */
export async function getPublishedCheckoutBySlug(
  slug: string,
): Promise<PublicCheckout | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: checkouts.id,
        slug: checkouts.slug,
        productSlug: products.slug,
        paymentMethods: checkouts.paymentMethods,
        config: checkouts.config,
      })
      .from(checkouts)
      .innerJoin(products, eq(checkouts.mainProductId, products.id))
      .where(
        and(
          eq(checkouts.slug, slug),
          eq(checkouts.status, "published"),
          isNull(checkouts.deletedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      slug: row.slug,
      productSlug: row.productSlug,
      paymentMethods: Array.isArray(row.paymentMethods)
        ? (row.paymentMethods as string[])
        : [],
      theme: parseCheckoutTheme(row.config),
    };
  } catch (error) {
    console.error("[checkouts] erro ao resolver checkout público:", error);
    return null;
  }
}
