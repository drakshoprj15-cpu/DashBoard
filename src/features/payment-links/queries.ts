import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customers,
  domains,
  orders,
  paymentLinkEvents,
  paymentLinks,
  payments,
  pixelBindings,
  pixels,
  products,
} from "@/database/schema";
import { getAppUrl } from "@/lib/app-url";
import { requireWorkspaceAccess } from "@/lib/workspace-access";
import type {
  PaymentLinkListItem,
  PaymentLinkMetrics,
  PaymentLinkPaymentRow,
  PublicPaymentLink,
} from "@/features/payment-links/types";
import {
  DEFAULT_PAYMENT_LINK_APPEARANCE,
  DEFAULT_PAYMENT_LINK_BRAND,
  DEFAULT_PAYMENT_LINK_SEO,
  DEFAULT_PAYMENT_LINK_SUCCESS,
  resolveLinkState,
} from "@/features/payment-links/types";
import type {
  CustomerFieldInput,
  PaymentLinkAppearanceInput,
  PaymentLinkBrandInput,
  PaymentLinkMethod,
  PaymentLinkSeoInput,
  PaymentLinkSuccessInput,
  ProductSnapshotInput,
  RequestFieldMode,
  ShippingOptionInput,
} from "@/validations/payment-link";
import { DEFAULT_CUSTOMER_FIELDS } from "@/validations/payment-link";

/**
 * Status de pedido que contam como receita. Mesma definição usada pelo resto
 * do painel (ver `features/finance`): dinheiro só existe depois da
 * confirmação do gateway — nunca no clique nem na referência gerada.
 */
const PAID_ORDER_STATUS = ["paid", "shipped", "delivered"] as const;

/** Cobrança iniciada e ainda sem desfecho. */
const PENDING_ORDER_STATUS = [
  "created",
  "awaiting_payment",
  "processing",
] as const;

export interface PaymentLinkRecord {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  title: string;
  description: string | null;
  amountCents: number;
  currency: string;
  status: "draft" | "published" | "unpublished" | "archived";
  paymentMethods: PaymentLinkMethod[];
  quantity: number;
  productId: string | null;
  productSnapshot: ProductSnapshotInput | null;
  requestName: RequestFieldMode;
  requestEmail: RequestFieldMode;
  requestPhone: RequestFieldMode;
  requiresAddress: boolean;
  requestShipping: boolean;
  shippingOptions: ShippingOptionInput[];
  customerFields: CustomerFieldInput[];
  logoUrl: string | null;
  brandConfig: PaymentLinkBrandInput;
  appearanceConfig: PaymentLinkAppearanceInput;
  successConfig: PaymentLinkSuccessInput;
  seoConfig: PaymentLinkSeoInput;
  buttonColor: string;
  buttonTextColor: string;
  borderColor: string;
  backgroundStyle: "light" | "dark";
  borderRadius: number;
  buttonText: string;
  domainId: string | null;
  domainHostname: string | null;
  domainVerified: boolean;
  domainActive: boolean;
  metaPixelEnabled: boolean;
  expiresAt: Date | null;
  maxPayments: number | null;
  isActive: boolean;
  archivedAt: Date | null;
  publishedSnapshot: PublicPaymentLink | null;
  publishedAt: Date | null;
  createdAt: Date;
}

/** Colunas do link — uma lista só, usada por todas as leituras. */
const linkColumns = {
  id: paymentLinks.id,
  workspaceId: paymentLinks.workspaceId,
  slug: paymentLinks.slug,
  name: paymentLinks.name,
  title: paymentLinks.title,
  description: paymentLinks.description,
  amountCents: paymentLinks.priceCents,
  currency: paymentLinks.currency,
  status: paymentLinks.status,
  paymentMethods: paymentLinks.paymentMethods,
  quantity: paymentLinks.quantity,
  productId: paymentLinks.productId,
  productSnapshot: paymentLinks.productSnapshot,
  requestName: paymentLinks.requestName,
  requestEmail: paymentLinks.requestEmail,
  requestPhone: paymentLinks.requestPhone,
  requiresAddress: paymentLinks.requiresAddress,
  requestShipping: paymentLinks.requestShipping,
  shippingOptions: paymentLinks.shippingOptions,
  customerFields: paymentLinks.customerFields,
  logoUrl: paymentLinks.logoUrl,
  brandConfig: paymentLinks.brandConfig,
  appearanceConfig: paymentLinks.appearanceConfig,
  successConfig: paymentLinks.successConfig,
  seoConfig: paymentLinks.seoConfig,
  buttonColor: paymentLinks.buttonColor,
  buttonTextColor: paymentLinks.buttonTextColor,
  borderColor: paymentLinks.borderColor,
  backgroundStyle: paymentLinks.backgroundStyle,
  borderRadius: paymentLinks.borderRadius,
  buttonText: paymentLinks.buttonText,
  domainId: paymentLinks.domainId,
  domainHostname: domains.hostname,
  domainVerified: domains.isVerified,
  domainActive: domains.isActive,
  metaPixelEnabled: paymentLinks.metaPixelEnabled,
  expiresAt: paymentLinks.expiresAt,
  maxPayments: paymentLinks.maxPayments,
  isActive: paymentLinks.isActive,
  archivedAt: paymentLinks.archivedAt,
  publishedSnapshot: paymentLinks.publishedSnapshot,
  publishedAt: paymentLinks.publishedAt,
  createdAt: paymentLinks.createdAt,
};

type RawLinkRow = {
  [K in keyof typeof linkColumns]: unknown;
};

function toRecord(row: RawLinkRow): PaymentLinkRecord {
  const legacyAppearance = {
    ...DEFAULT_PAYMENT_LINK_APPEARANCE,
    backgroundStyle: row.backgroundStyle === "dark" ? "dark" : "light",
    backgroundColor: row.backgroundStyle === "dark" ? "#0B0B0F" : "#F6F7F9",
    cardColor: row.backgroundStyle === "dark" ? "#15151C" : "#FFFFFF",
    titleColor: row.backgroundStyle === "dark" ? "#F4F4F5" : "#18181B",
    textColor: row.backgroundStyle === "dark" ? "#A1A1AA" : "#71717A",
    inputBackgroundColor:
      row.backgroundStyle === "dark" ? "#1C1C25" : "#FFFFFF",
    inputTextColor: row.backgroundStyle === "dark" ? "#F4F4F5" : "#18181B",
    buttonColor: String(row.buttonColor ?? "#E5097F"),
    buttonTextColor: String(row.buttonTextColor ?? "#FFFFFF"),
    cardBorderColor: String(row.borderColor ?? "#E5E7EB"),
    inputBorderColor: String(row.borderColor ?? "#E5E7EB"),
    cardRadius: Number(row.borderRadius ?? 16),
    buttonText: String(row.buttonText ?? "Pagar agora"),
  } satisfies Record<string, unknown>;
  const appearance = {
    ...legacyAppearance,
    ...((row.appearanceConfig as Record<string, unknown> | null) ?? {}),
  } as unknown as PaymentLinkAppearanceInput;
  const brand = {
    ...DEFAULT_PAYMENT_LINK_BRAND,
    ...((row.brandConfig as Record<string, unknown> | null) ?? {}),
  } as PaymentLinkBrandInput;
  const customerFields =
    Array.isArray(row.customerFields) && row.customerFields.length
      ? (row.customerFields as CustomerFieldInput[])
      : DEFAULT_CUSTOMER_FIELDS.map((field) => {
          if (field.key === "firstName")
            return { ...field, mode: row.requestName as RequestFieldMode };
          if (field.key === "email")
            return { ...field, mode: row.requestEmail as RequestFieldMode };
          if (field.key === "phone")
            return { ...field, mode: row.requestPhone as RequestFieldMode };
          if (
            row.requiresAddress &&
            ["addressLine1", "postalCode", "city", "country"].includes(
              field.key,
            )
          ) {
            return { ...field, mode: "required" as const };
          }
          return field;
        });

  return {
    ...(row as unknown as PaymentLinkRecord),
    productSnapshot:
      (row.productSnapshot as ProductSnapshotInput | null) ?? null,
    shippingOptions: Array.isArray(row.shippingOptions)
      ? (row.shippingOptions as ShippingOptionInput[])
      : [],
    paymentMethods: Array.isArray(row.paymentMethods)
      ? (row.paymentMethods as PaymentLinkMethod[])
      : [],
    customerFields,
    brandConfig: brand,
    appearanceConfig: appearance,
    successConfig: {
      ...DEFAULT_PAYMENT_LINK_SUCCESS,
      ...((row.successConfig as Record<string, unknown> | null) ?? {}),
    } as PaymentLinkSuccessInput,
    seoConfig: {
      ...DEFAULT_PAYMENT_LINK_SEO,
      ...((row.seoConfig as Record<string, unknown> | null) ?? {}),
    } as PaymentLinkSeoInput,
    domainVerified: Boolean(row.domainVerified),
    domainActive: Boolean(row.domainActive),
    domainHostname:
      row.domainVerified && row.domainActive
        ? (row.domainHostname as string | null)
        : null,
    publishedSnapshot:
      row.publishedSnapshot && typeof row.publishedSnapshot === "object"
        ? (row.publishedSnapshot as PublicPaymentLink)
        : null,
  };
}

/**
 * URL pública de um link.
 *
 * Sempre gerada aqui, a partir do domínio próprio do workspace ou do domínio
 * da própria aplicação — nunca um endereço de terceiro fixo em código.
 */
export function buildPaymentLinkUrl(
  slug: string,
  hostname: string | null,
): string {
  const base = hostname ? `https://${hostname}` : getAppUrl();
  return `${base.replace(/\/$/, "")}/pagar/${slug}`;
}

/** Um link do workspace atual, pelo id. Devolve null fora do workspace. */
export async function getPaymentLinkById(
  id: string,
): Promise<PaymentLinkRecord | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess();

  const [row] = await db
    .select(linkColumns)
    .from(paymentLinks)
    .leftJoin(domains, eq(domains.id, paymentLinks.domainId))
    .where(
      and(
        eq(paymentLinks.id, id),
        // Isolamento entre workspaces: nunca só pelo id.
        eq(paymentLinks.workspaceId, workspaceId),
        isNull(paymentLinks.deletedAt),
      ),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}

/**
 * Link pela URL pública. Sem filtro de workspace de propósito — o slug é
 * único no banco inteiro e quem chama é a página pública, que não tem sessão.
 */
export async function getPaymentLinkBySlug(
  slug: string,
): Promise<PaymentLinkRecord | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const [row] = await db
    .select(linkColumns)
    .from(paymentLinks)
    .leftJoin(domains, eq(domains.id, paymentLinks.domainId))
    .where(and(eq(paymentLinks.slug, slug), isNull(paymentLinks.deletedAt)))
    .limit(1);

  return row ? toRecord(row) : null;
}

/**
 * Quantos pagamentos deste link já foram CONFIRMADOS pelo gateway.
 * É esta contagem que trava o limite de usos — não um contador incrementado
 * no clique, que abriria espaço para dupla cobrança.
 */
export async function countPaidPayments(
  paymentLinkId: string,
): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const db = getDb();
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.paymentLinkId, paymentLinkId),
        inArray(orders.status, [...PAID_ORDER_STATUS]),
      ),
    );

  return row?.total ?? 0;
}

/** Recorte do link enviado ao navegador de quem vai pagar. */
export function toPublicPaymentLink(
  record: PaymentLinkRecord,
): PublicPaymentLink {
  if (record.publishedSnapshot) {
    return { ...record.publishedSnapshot, slug: record.slug };
  }

  return {
    slug: record.slug,
    title: record.title,
    description: record.description,
    amountCents: record.amountCents,
    currency: record.currency,
    product: record.productSnapshot,
    paymentMethods: record.paymentMethods,
    brand: {
      ...DEFAULT_PAYMENT_LINK_BRAND,
      ...record.brandConfig,
      logoUrl: record.logoUrl,
    },
    appearance: {
      ...DEFAULT_PAYMENT_LINK_APPEARANCE,
      ...record.appearanceConfig,
      backgroundStyle: record.backgroundStyle,
      borderColor: record.borderColor,
      borderRadius: record.borderRadius,
      buttonText: record.buttonText,
    },
    fields: {
      requestName: record.requestName,
      requestEmail: record.requestEmail,
      requestPhone: record.requestPhone,
      requiresAddress: record.requiresAddress,
      requestShipping: record.requestShipping,
      shippingOptions: record.shippingOptions,
      customerFields: record.customerFields,
    },
    success: record.successConfig,
    seo: record.seoConfig,
  };
}

interface FunnelRow {
  views: number;
  started: number;
  paid: number;
  pending: number;
  failed: number;
  revenueCents: number;
  lastSaleAt: Date | null;
}

const EMPTY_FUNNEL: FunnelRow = {
  views: 0,
  started: 0,
  paid: 0,
  pending: 0,
  failed: 0,
  revenueCents: 0,
  lastSaleAt: null,
};

/**
 * Funil de cada link, em duas agregações (visitas e pedidos) juntadas em
 * memória — mais legível que subconsultas correlacionadas e igualmente
 * indexado.
 */
async function loadFunnels(
  workspaceId: string,
  since: Date | null,
): Promise<Map<string, FunnelRow>> {
  const db = getDb();
  const map = new Map<string, FunnelRow>();

  const viewRows = await db
    .select({
      linkId: paymentLinkEvents.paymentLinkId,
      views: sql<number>`count(distinct case when ${paymentLinkEvents.type} = 'view' then coalesce(${paymentLinkEvents.visitorKey}, ${paymentLinkEvents.id}::text) end)::int`,
    })
    .from(paymentLinkEvents)
    .where(
      and(
        eq(paymentLinkEvents.workspaceId, workspaceId),
        since ? gte(paymentLinkEvents.createdAt, since) : undefined,
      ),
    )
    .groupBy(paymentLinkEvents.paymentLinkId);

  for (const row of viewRows) {
    map.set(row.linkId, { ...EMPTY_FUNNEL, views: row.views });
  }

  const orderRows = await db
    .select({
      linkId: orders.paymentLinkId,
      started: sql<number>`count(*)::int`,
      paid: sql<number>`count(*) filter (where ${orders.status} in ('paid','shipped','delivered'))::int`,
      pending: sql<number>`count(*) filter (where ${orders.status} in ('created','awaiting_payment','processing'))::int`,
      failed: sql<number>`count(*) filter (where ${orders.status} in ('refused','expired','cancelled'))::int`,
      revenueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','shipped','delivered')), 0)::bigint`,
      lastSaleAt: sql<Date | null>`max(${orders.paidAt}) filter (where ${orders.status} in ('paid','shipped','delivered'))`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        sql`${orders.paymentLinkId} is not null`,
        since ? gte(orders.createdAt, since) : undefined,
      ),
    )
    .groupBy(orders.paymentLinkId);

  for (const row of orderRows) {
    if (!row.linkId) continue;
    const current = map.get(row.linkId) ?? { ...EMPTY_FUNNEL };
    map.set(row.linkId, {
      ...current,
      started: row.started,
      paid: row.paid,
      pending: row.pending,
      failed: row.failed,
      revenueCents: Number(row.revenueCents),
      lastSaleAt: row.lastSaleAt ? new Date(row.lastSaleAt) : null,
    });
  }

  return map;
}

/** Início do período escolhido no seletor; `null` = desde sempre. */
export function periodStart(period: string, customFrom?: string): Date | null {
  if (period === "custom" && customFrom) {
    const parsed = new Date(customFrom);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const now = new Date();
  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000);
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000);
    case "90d":
      return new Date(now.getTime() - 90 * 86_400_000);
    default:
      return null;
  }
}

export interface PaymentLinksPageData {
  links: PaymentLinkListItem[];
  metrics: PaymentLinkMetrics;
}

/**
 * Listagem completa do painel com o funil de cada link já agregado.
 * O período afeta apenas as métricas — a lista de links continua inteira,
 * para que um link antigo sem tráfego no período ainda possa ser editado.
 */
export async function listPaymentLinks(
  period: string = "30d",
  customFrom?: string,
): Promise<PaymentLinksPageData> {
  const emptyMetrics: PaymentLinkMetrics = {
    activeLinks: 0,
    revenueCents: 0,
    paidPayments: 0,
    pendingPayments: 0,
    failedPayments: 0,
    views: 0,
    conversionRate: 0,
    averageTicketCents: 0,
    currency: "EUR",
  };

  if (!isDatabaseConfigured()) return { links: [], metrics: emptyMetrics };

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess();
  const since = periodStart(period, customFrom);

  const rows = await db
    .select(linkColumns)
    .from(paymentLinks)
    .leftJoin(domains, eq(domains.id, paymentLinks.domainId))
    .where(
      and(
        eq(paymentLinks.workspaceId, workspaceId),
        isNull(paymentLinks.deletedAt),
      ),
    )
    .orderBy(desc(paymentLinks.createdAt));

  const [funnels, lifetimePaid] = await Promise.all([
    loadFunnels(workspaceId, since),
    // Limite de usos e estado "esgotado" olham a vida inteira do link, nunca
    // só o período selecionado no filtro de métricas.
    loadFunnels(workspaceId, null),
  ]);

  const links: PaymentLinkListItem[] = rows.map((raw) => {
    const record = toRecord(raw);
    const funnel = funnels.get(record.id) ?? EMPTY_FUNNEL;
    const paidCount = lifetimePaid.get(record.id)?.paid ?? 0;

    return {
      id: record.id,
      slug: record.slug,
      name: record.name || record.title,
      title: record.title,
      url: buildPaymentLinkUrl(record.slug, record.domainHostname),
      domainHostname: record.domainHostname,
      amountCents: record.amountCents,
      currency: record.currency,
      state: resolveLinkState({
        isActive: record.isActive,
        status: record.status,
        archivedAt: record.archivedAt,
        expiresAt: record.expiresAt,
        maxPayments: record.maxPayments,
        paidCount,
      }),
      isActive: record.isActive,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      maxPayments: record.maxPayments,
      createdAt: record.createdAt.toISOString(),
      productName: record.productSnapshot?.name ?? null,
      views: funnel.views,
      paymentsStarted: funnel.started,
      paymentsPaid: funnel.paid,
      pendingPayments: funnel.pending,
      failedPayments: funnel.failed,
      revenueCents: funnel.revenueCents,
      averageTicketCents:
        funnel.paid > 0 ? Math.round(funnel.revenueCents / funnel.paid) : 0,
      conversionRate: funnel.views > 0 ? funnel.paid / funnel.views : 0,
      lastSaleAt: funnel.lastSaleAt?.toISOString() ?? null,
    };
  });

  const totals = links.reduce(
    (acc, link) => ({
      revenueCents: acc.revenueCents + link.revenueCents,
      paidPayments: acc.paidPayments + link.paymentsPaid,
      pendingPayments: acc.pendingPayments + link.pendingPayments,
      failedPayments: acc.failedPayments + link.failedPayments,
      views: acc.views + link.views,
    }),
    {
      revenueCents: 0,
      paidPayments: 0,
      pendingPayments: 0,
      failedPayments: 0,
      views: 0,
    },
  );

  return {
    links,
    metrics: {
      ...totals,
      activeLinks: links.filter((link) => link.state === "active").length,
      conversionRate: totals.views > 0 ? totals.paidPayments / totals.views : 0,
      averageTicketCents:
        totals.paidPayments > 0
          ? Math.round(totals.revenueCents / totals.paidPayments)
          : 0,
      currency: links[0]?.currency ?? "EUR",
    },
  };
}

/** Pagamentos de um link, para a aba de detalhe. */
export async function listPaymentLinkPayments(
  paymentLinkId: string,
  limit = 50,
): Promise<PaymentLinkPaymentRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess([
    "owner",
    "admin",
    "finance",
    "support",
  ]);

  const rows = await db
    .select({
      orderId: orders.id,
      reference: orders.reference,
      firstName: customers.firstName,
      lastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      method: payments.method,
      amountCents: orders.totalCents,
      currency: orders.currency,
      status: orders.status,
      providerTransactionId: payments.externalId,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        eq(orders.paymentLinkId, paymentLinkId),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    orderId: row.orderId,
    reference: row.reference,
    customerName:
      [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    method: row.method,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    providerTransactionId: row.providerTransactionId,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  }));
}

export interface PaymentLinkDomainOption {
  id: string;
  hostname: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

/** Domínios do workspace oferecidos na criação do link. */
export async function listPaymentLinkDomains(): Promise<
  PaymentLinkDomainOption[]
> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess();

  const rows = await db
    .select({
      id: domains.id,
      hostname: domains.hostname,
      isVerified: domains.isVerified,
      isActive: domains.isActive,
      createdAt: domains.createdAt,
    })
    .from(domains)
    .where(eq(domains.workspaceId, workspaceId))
    .orderBy(domains.hostname);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export interface CatalogProductOption {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  description: string | null;
}

/** Produtos do catálogo oferecidos ao ligar "Mostrar produto". */
export async function listCatalogProductsForLinks(): Promise<
  CatalogProductOption[]
> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const { workspaceId } = await requireWorkspaceAccess();

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      priceCents: products.priceCents,
      imageUrl: products.mainImageUrl,
      description: products.shortDescription,
    })
    .from(products)
    .where(
      and(eq(products.workspaceId, workspaceId), isNull(products.deletedAt)),
    )
    .orderBy(products.name)
    .limit(200);

  return rows;
}

export interface PaymentLinkPixelOption {
  id: string;
  name: string;
  type: string;
  publicId: string | null;
}

/** Integrações ativas que podem ser vinculadas ao link sem expor tokens. */
export async function listPaymentLinkPixels(): Promise<
  PaymentLinkPixelOption[]
> {
  if (!isDatabaseConfigured()) return [];
  const { workspaceId } = await requireWorkspaceAccess();
  return getDb()
    .select({
      id: pixels.id,
      name: pixels.name,
      type: pixels.type,
      publicId: pixels.pixelId,
    })
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        eq(pixels.isActive, true),
        isNull(pixels.deletedAt),
      ),
    )
    .orderBy(pixels.name);
}

export async function listPaymentLinkPixelIds(
  linkId: string,
): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  const record = await getPaymentLinkById(linkId);
  if (!record) return [];
  const rows = await getDb()
    .select({ pixelId: pixelBindings.pixelId })
    .from(pixelBindings)
    .where(
      and(
        eq(pixelBindings.workspaceId, record.workspaceId),
        eq(pixelBindings.targetType, "payment_link"),
        eq(pixelBindings.targetId, record.id),
      ),
    );
  return rows.map((row) => row.pixelId);
}

export { PAID_ORDER_STATUS, PENDING_ORDER_STATUS };
