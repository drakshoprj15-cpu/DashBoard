import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb, isDatabaseConfigured, type Database } from "@/database/client";
import {
  chargebacks,
  customerConsents,
  customers,
  orderItems,
  orderStatusHistory,
  orders,
  paymentWebhooks,
  payments,
  refunds,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  ABANDON_THRESHOLD_HOURS,
  resolveCartCategory,
  type CartCategory,
  type CartTab,
} from "@/features/carts/status";

/**
 * "Carrinhos" desta operação: pedidos criados no checkout, do primeiro
 * estado até pago (ou perdido). Não há carrinho de compras clássico — o
 * cliente vai direto da landing ao checkout —, então este módulo reaproveita
 * `orders` como fonte única da verdade (as tabelas `carts`/`cart_items` do
 * schema ficam reservadas para um fluxo de carrinho pré-checkout futuro).
 */

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const MAX_PAGE_SIZE = 100;

export function clampPage(page: number | undefined | null): number {
  if (!page || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export function clampPageSize(size: number | undefined | null): number {
  if (!size || !Number.isFinite(size) || size < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(size), MAX_PAGE_SIZE);
}

/**
 * Sanitiza um termo de busca livre: corta o tamanho e escapa os curingas do
 * ILIKE (`%`, `_`, `\`) para que a entrada do usuário nunca vire um curinga
 * de busca não intencional (ou, no limite, uma forma de negação de serviço
 * com curingas custosos).
 */
export function sanitizeSearchTerm(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().slice(0, 120);
  if (!trimmed) return undefined;
  return trimmed.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Instante a partir do qual um "aguardando pagamento" passa a contar como
 * abandonado. Devolvido como ISO string porque estes templates `sql` são
 * crus: um `Date` interpolado direto não passa pelo mapeador de coluna do
 * Drizzle e o driver `postgres.js` rejeita-o. A comparação usa sempre um
 * cast explícito para `timestamptz`.
 */
function abandonCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - ABANDON_THRESHOLD_HOURS * 3_600_000).toISOString();
}

function tabCondition(tab: CartTab | undefined, cutoff: string): SQL | undefined {
  if (!tab || tab === "all") return undefined;
  switch (tab) {
    case "awaiting_payment":
      return sql`${orders.status} in ('created','awaiting_payment') and ${orders.updatedAt} >= ${cutoff}::timestamptz`;
    case "abandoned":
      return sql`${orders.status} in ('created','awaiting_payment') and ${orders.updatedAt} < ${cutoff}::timestamptz`;
    case "pending":
      return sql`${orders.status} = 'processing'`;
    case "paid":
      return sql`${orders.status} in ('paid','preparing','shipped','delivered')`;
    case "declined":
      return sql`${orders.status} = 'refused'`;
    case "other":
      return sql`${orders.status} in ('expired','cancelled','refunded','chargeback')`;
    default:
      return undefined;
  }
}

export interface CartFilters {
  search?: string;
  tab?: CartTab;
  paymentMethod?: string;
  gateway?: string;
  country?: string;
  currency?: string;
  productId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "totalCents";
  sortDir?: "asc" | "desc";
}

function gatewayFromMetadata(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "provider" in metadata) {
    const provider = (metadata as Record<string, unknown>).provider;
    return typeof provider === "string" ? provider : null;
  }
  return null;
}

/**
 * Condições comuns a listagem, contagem e resumos — tudo exceto a aba de
 * status (que cada consumidor aplica separadamente). Filtros que dependem de
 * `order_items`/`payments` (tabelas 1:N em relação a `orders`) são resolvidos
 * como uma pré-consulta de ids candidatos em vez de JOIN, para nunca
 * duplicar linhas de pedido.
 */
async function buildBaseWhere(
  db: Database,
  workspaceId: string,
  filters: Pick<
    CartFilters,
    "search" | "paymentMethod" | "gateway" | "productId" | "country" | "currency" | "dateFrom" | "dateTo"
  >,
): Promise<SQL> {
  const conditions: SQL[] = [eq(orders.workspaceId, workspaceId)];

  const term = sanitizeSearchTerm(filters.search);
  if (term) {
    const like = `%${term}%`;
    const txRows = await db
      .select({ orderId: payments.orderId })
      .from(payments)
      .where(and(eq(payments.workspaceId, workspaceId), ilike(payments.externalId, like)))
      .limit(500);
    const txOrderIds = txRows.map((r) => r.orderId);

    conditions.push(
      or(
        ilike(customers.firstName, like),
        ilike(customers.lastName, like),
        ilike(customers.email, like),
        ilike(customers.phone, like),
        ilike(customers.document, like),
        ilike(orders.reference, like),
        txOrderIds.length > 0 ? inArray(orders.id, txOrderIds) : sql`false`,
      )!,
    );
  }

  if (filters.paymentMethod || filters.gateway) {
    const paymentConds: SQL[] = [eq(payments.workspaceId, workspaceId)];
    if (filters.paymentMethod) paymentConds.push(eq(payments.method, filters.paymentMethod));
    if (filters.gateway) {
      paymentConds.push(sql`${payments.metadata}->>'provider' = ${filters.gateway}`);
    }
    const rows = await db
      .select({ orderId: payments.orderId })
      .from(payments)
      .where(and(...paymentConds))
      .limit(2000);
    const ids = rows.map((r) => r.orderId);
    conditions.push(ids.length > 0 ? inArray(orders.id, ids) : sql`false`);
  }

  if (filters.productId) {
    const rows = await db
      .select({ orderId: orderItems.orderId })
      .from(orderItems)
      .where(
        and(eq(orderItems.workspaceId, workspaceId), eq(orderItems.productId, filters.productId)),
      )
      .limit(2000);
    const ids = rows.map((r) => r.orderId);
    conditions.push(ids.length > 0 ? inArray(orders.id, ids) : sql`false`);
  }

  if (filters.country) conditions.push(eq(orders.countryCode, filters.country));
  if (filters.currency) conditions.push(eq(orders.currency, filters.currency));
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, filters.dateTo));

  return and(...conditions)!;
}

export interface CartRow {
  orderId: string;
  reference: string;
  status: string;
  category: CartCategory;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerDocument: string | null;
  countryCode: string | null;
  productName: string | null;
  quantity: number | null;
  itemCount: number;
  totalCents: number;
  currency: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  gateway: string | null;
  externalId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  lastReminderSentAt: Date | null;
  marketingOptOut: boolean;
}

export interface CartListResult {
  rows: CartRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface FirstItem {
  productName: string;
  quantity: number;
  itemCount: number;
}

async function fetchFirstItemByOrder(
  db: Database,
  orderIds: string[],
): Promise<Map<string, FirstItem>> {
  const map = new Map<string, FirstItem>();
  if (orderIds.length === 0) return map;

  const rows = await db
    .select({
      orderId: orderItems.orderId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.createdAt));

  for (const r of rows) {
    const existing = map.get(r.orderId);
    if (!existing) {
      map.set(r.orderId, { productName: r.productName, quantity: r.quantity, itemCount: 1 });
    } else {
      existing.itemCount += 1;
    }
  }
  return map;
}

interface LatestPayment {
  method: string;
  status: string;
  externalId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  failureReason: string | null;
  metadata: unknown;
}

async function fetchLatestPaymentByOrder(
  db: Database,
  orderIds: string[],
): Promise<Map<string, LatestPayment>> {
  const map = new Map<string, LatestPayment>();
  if (orderIds.length === 0) return map;

  const rows = await db
    .select({
      orderId: payments.orderId,
      method: payments.method,
      status: payments.status,
      externalId: payments.externalId,
      cardBrand: payments.cardBrand,
      cardLast4: payments.cardLast4,
      failureReason: payments.failureReason,
      metadata: payments.metadata,
    })
    .from(payments)
    .where(inArray(payments.orderId, orderIds))
    .orderBy(desc(payments.createdAt));

  for (const r of rows) {
    if (!map.has(r.orderId)) map.set(r.orderId, r);
  }
  return map;
}

/**
 * Lista paginada de carrinhos (pedidos), com busca, filtros e ordenação
 * processados no backend. Nunca carrega mais que `pageSize` pedidos — os
 * dados de item/pagamento da página são buscados em lote (2 consultas
 * extras, não N+1) e combinados em memória.
 */
export async function listCarts(filters: CartFilters): Promise<CartListResult> {
  const page = clampPage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);

  if (!isDatabaseConfigured()) {
    return { rows: [], total: 0, page, pageSize };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const cutoff = abandonCutoff();

  const baseWhere = await buildBaseWhere(db, workspaceId, filters);
  const tabWhere = tabCondition(filters.tab, cutoff);
  const where = tabWhere ? and(baseWhere, tabWhere)! : baseWhere;

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(where);
  const total = totalRow?.total ?? 0;

  const sortColumn = filters.sortBy === "totalCents" ? orders.totalCents : orders.createdAt;
  const orderBy = filters.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

  const rows = await db
    .select({
      orderId: orders.id,
      reference: orders.reference,
      status: orders.status,
      totalCents: orders.totalCents,
      currency: orders.currency,
      countryCode: orders.countryCode,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      paidAt: orders.paidAt,
      lastReminderSentAt: orders.lastReminderSentAt,
      customerId: orders.customerId,
      customerFirst: customers.firstName,
      customerLast: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerDocument: customers.document,
      marketingOptOut: customers.marketingOptOut,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const orderIds = rows.map((r) => r.orderId);
  const [itemsByOrder, paymentByOrder] = await Promise.all([
    fetchFirstItemByOrder(db, orderIds),
    fetchLatestPaymentByOrder(db, orderIds),
  ]);

  const result: CartRow[] = rows.map((r) => {
    const hoursSinceUpdate = (Date.now() - new Date(r.updatedAt).getTime()) / 3_600_000;
    const item = itemsByOrder.get(r.orderId);
    const payment = paymentByOrder.get(r.orderId);

    return {
      orderId: r.orderId,
      reference: r.reference,
      status: r.status,
      category: resolveCartCategory(r.status, hoursSinceUpdate),
      customerId: r.customerId,
      customerName: [r.customerFirst, r.customerLast].filter(Boolean).join(" ") || null,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      customerDocument: r.customerDocument,
      countryCode: r.countryCode,
      productName: item?.productName ?? null,
      quantity: item?.quantity ?? null,
      itemCount: item?.itemCount ?? 0,
      totalCents: Number(r.totalCents),
      currency: r.currency,
      paymentMethod: payment?.method ?? null,
      paymentStatus: payment?.status ?? null,
      gateway: payment ? gatewayFromMetadata(payment.metadata) : null,
      externalId: payment?.externalId ?? null,
      cardBrand: payment?.cardBrand ?? null,
      cardLast4: payment?.cardLast4 ?? null,
      failureReason: payment?.failureReason ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      paidAt: r.paidAt,
      lastReminderSentAt: r.lastReminderSentAt,
      marketingOptOut: r.marketingOptOut ?? false,
    };
  });

  return { rows: result, total, page, pageSize };
}

export interface PendingReminderCandidates {
  orderIds: string[];
  matchedTotal: number;
}

/**
 * Ids de pedidos elegíveis para o lembrete em massa "Enviar lembrete aos
 * pendentes" — aguardando pagamento, pendente ou abandonado (as três
 * categorias que ainda podem ser recuperadas), respeitando os filtros
 * atuais da página exceto a aba selecionada. Limitado a `limit` por chamada.
 */
export async function listPendingReminderCandidates(
  filters: Pick<
    CartFilters,
    "search" | "paymentMethod" | "gateway" | "productId" | "country" | "currency" | "dateFrom" | "dateTo"
  >,
  limit = 200,
): Promise<PendingReminderCandidates> {
  if (!isDatabaseConfigured()) return { orderIds: [], matchedTotal: 0 };

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const baseWhere = await buildBaseWhere(db, workspaceId, filters);
  const where = and(baseWhere, sql`${orders.status} in ('created','awaiting_payment','processing')`)!;

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(where);

  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  return { orderIds: rows.map((r) => r.id), matchedTotal: totalRow?.n ?? 0 };
}

export interface CartFacets {
  tabCounts: Record<CartTab, number>;
  totals: {
    awaitingPayment: { count: number; valueCents: number };
    pending: { count: number; valueCents: number };
    paid: { count: number; valueCents: number };
    declined: { count: number; valueCents: number };
    /** Pagos ÷ total de pedidos no filtro — nunca inclui abandono no denominador extra. */
    conversionRate: number;
  };
}

function emptyFacets(): CartFacets {
  return {
    tabCounts: {
      all: 0,
      awaiting_payment: 0,
      pending: 0,
      paid: 0,
      declined: 0,
      abandoned: 0,
      other: 0,
    },
    totals: {
      awaitingPayment: { count: 0, valueCents: 0 },
      pending: { count: 0, valueCents: 0 },
      paid: { count: 0, valueCents: 0 },
      declined: { count: 0, valueCents: 0 },
      conversionRate: 0,
    },
  };
}

/**
 * Contagens por aba + totais para os cards de indicador. Respeita todos os
 * filtros exceto a própria aba (para o usuário ver, em cada aba, quantos
 * resultados existem antes de clicar).
 */
export async function getCartsFacets(
  filters: Omit<CartFilters, "tab" | "page" | "pageSize" | "sortBy" | "sortDir">,
): Promise<CartFacets> {
  if (!isDatabaseConfigured()) return emptyFacets();

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const cutoff = abandonCutoff();
  const baseWhere = await buildBaseWhere(db, workspaceId, filters);

  const [row] = await db
    .select({
      awaitingCount: sql<number>`count(*) filter (where ${orders.status} in ('created','awaiting_payment') and ${orders.updatedAt} >= ${cutoff}::timestamptz)::int`,
      awaitingValue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('created','awaiting_payment') and ${orders.updatedAt} >= ${cutoff}::timestamptz), 0)::int`,
      abandonedCount: sql<number>`count(*) filter (where ${orders.status} in ('created','awaiting_payment') and ${orders.updatedAt} < ${cutoff}::timestamptz)::int`,
      pendingCount: sql<number>`count(*) filter (where ${orders.status} = 'processing')::int`,
      pendingValue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'processing'), 0)::int`,
      paidCount: sql<number>`count(*) filter (where ${orders.status} in ('paid','preparing','shipped','delivered'))::int`,
      paidValue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','preparing','shipped','delivered')), 0)::int`,
      declinedCount: sql<number>`count(*) filter (where ${orders.status} = 'refused')::int`,
      declinedValue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'refused'), 0)::int`,
      otherCount: sql<number>`count(*) filter (where ${orders.status} in ('expired','cancelled','refunded','chargeback'))::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(baseWhere);

  const totalCount = row?.totalCount ?? 0;
  const paidCount = row?.paidCount ?? 0;

  return {
    tabCounts: {
      all: totalCount,
      awaiting_payment: row?.awaitingCount ?? 0,
      pending: row?.pendingCount ?? 0,
      paid: paidCount,
      declined: row?.declinedCount ?? 0,
      abandoned: row?.abandonedCount ?? 0,
      other: row?.otherCount ?? 0,
    },
    totals: {
      awaitingPayment: { count: row?.awaitingCount ?? 0, valueCents: row?.awaitingValue ?? 0 },
      pending: { count: row?.pendingCount ?? 0, valueCents: row?.pendingValue ?? 0 },
      paid: { count: paidCount, valueCents: row?.paidValue ?? 0 },
      declined: { count: row?.declinedCount ?? 0, valueCents: row?.declinedValue ?? 0 },
      conversionRate: totalCount > 0 ? paidCount / totalCount : 0,
    },
  };
}

/** Contagem simples de pedidos ainda não resolvidos — usada no alerta da Dashboard. */
export async function getPendingCartsCount(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        sql`${orders.status} in ('created','awaiting_payment','processing')`,
      ),
    );
  return row?.n ?? 0;
}

export interface TimelineEvent {
  key: string;
  label: string;
  detail?: string;
  at: Date;
  source: "order" | "payment" | "webhook" | "refund" | "chargeback" | "history";
}

export interface CartDetail {
  order: {
    id: string;
    reference: string;
    status: string;
    category: CartCategory;
    currency: string;
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number;
    shippingAddress: unknown;
    billingAddress: unknown;
    shippingMethod: string | null;
    utm: Record<string, string> | null;
    origin: string | null;
    deviceType: string | null;
    countryCode: string | null;
    internalNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    paidAt: Date | null;
    cancelledAt: Date | null;
    lastReminderSentAt: Date | null;
  };
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    document: string | null;
    country: string | null;
    marketingOptOut: boolean;
    isBlocked: boolean;
    createdAt: Date;
  } | null;
  items: {
    productName: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }[];
  payments: {
    id: string;
    externalId: string | null;
    status: string;
    method: string;
    amountCents: number;
    feeCents: number;
    netCents: number | null;
    currency: string;
    gateway: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    pixQrCode: string | null;
    boletoUrl: string | null;
    failureReason: string | null;
    approvedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }[];
  refunds: { id: string; amountCents: number; status: string; reason: string | null; createdAt: Date }[];
  chargebacks: { id: string; amountCents: number; status: string; reason: string | null; createdAt: Date }[];
  consents: { type: string; granted: boolean; source: string | null; createdAt: Date }[];
  timeline: TimelineEvent[];
}

const PAYMENT_EVENT_LABEL: Record<string, string> = {
  "order.paid": "Pagamento aprovado",
  "order.refused": "Pagamento recusado",
  "order.refunded": "Pagamento reembolsado",
  "order.chargeback": "Chargeback aberto",
};

/** Detalhe completo de um carrinho/pedido para o drawer — escopado ao workspace. */
export async function getCartDetail(orderId: string): Promise<CartDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [orderRow] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)))
    .limit(1);
  if (!orderRow) return null;

  const [customerRow] = orderRow.customerId
    ? await db.select().from(customers).where(eq(customers.id, orderRow.customerId)).limit(1)
    : [undefined];

  const [itemRows, paymentRows, historyRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(asc(payments.createdAt)),
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.createdAt)),
  ]);

  const paymentIds = paymentRows.map((p) => p.id);

  const [webhookRows, refundRows, chargebackRows, consentRows] = await Promise.all([
    paymentIds.length > 0
      ? db
          .select()
          .from(paymentWebhooks)
          .where(inArray(paymentWebhooks.paymentId, paymentIds))
          .orderBy(asc(paymentWebhooks.createdAt))
      : Promise.resolve([]),
    db.select().from(refunds).where(eq(refunds.orderId, orderId)),
    db.select().from(chargebacks).where(eq(chargebacks.orderId, orderId)),
    customerRow
      ? db.select().from(customerConsents).where(eq(customerConsents.customerId, customerRow.id))
      : Promise.resolve([]),
  ]);

  const hoursSinceUpdate = (Date.now() - new Date(orderRow.updatedAt).getTime()) / 3_600_000;

  const timeline: TimelineEvent[] = [
    {
      key: "order_created",
      label: "Checkout iniciado",
      detail: orderRow.reference,
      at: orderRow.createdAt,
      source: "order" as const,
    },
    ...historyRows.map((h): TimelineEvent => ({
      key: `history_${h.id}`,
      label: `Status alterado${h.fromStatus ? `: ${h.fromStatus} → ${h.toStatus}` : `: ${h.toStatus}`}`,
      detail: h.reason ?? undefined,
      at: h.createdAt,
      source: "history",
    })),
    ...paymentRows.flatMap((p): TimelineEvent[] => {
      const events: TimelineEvent[] = [
        {
          key: `payment_created_${p.id}`,
          label: `Pagamento criado (${p.method})`,
          detail: p.externalId ?? undefined,
          at: p.createdAt,
          source: "payment",
        },
      ];
      if (p.approvedAt) {
        events.push({
          key: `payment_approved_${p.id}`,
          label: "Pagamento aprovado",
          at: p.approvedAt,
          source: "payment",
        });
      }
      return events;
    }),
    ...webhookRows.map((w): TimelineEvent => ({
      key: `webhook_${w.id}`,
      label: PAYMENT_EVENT_LABEL[w.eventType] ?? `Webhook recebido: ${w.eventType}`,
      detail: w.signatureValid ? "assinatura válida" : "assinatura inválida",
      at: w.createdAt,
      source: "webhook",
    })),
    ...refundRows.map((r): TimelineEvent => ({
      key: `refund_${r.id}`,
      label: r.status === "completed" ? "Reembolso concluído" : "Reembolso solicitado",
      detail: r.reason ?? undefined,
      at: r.completedAt ?? r.createdAt,
      source: "refund",
    })),
    ...chargebackRows.map((c): TimelineEvent => ({
      key: `chargeback_${c.id}`,
      label: c.status === "open" ? "Chargeback aberto" : `Chargeback ${c.status === "won" ? "ganho" : "perdido"}`,
      detail: c.reason ?? undefined,
      at: c.disputedAt ?? c.createdAt,
      source: "chargeback",
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    order: {
      id: orderRow.id,
      reference: orderRow.reference,
      status: orderRow.status,
      category: resolveCartCategory(orderRow.status, hoursSinceUpdate),
      currency: orderRow.currency,
      subtotalCents: Number(orderRow.subtotalCents),
      discountCents: Number(orderRow.discountCents),
      shippingCents: Number(orderRow.shippingCents),
      taxCents: Number(orderRow.taxCents),
      totalCents: Number(orderRow.totalCents),
      shippingAddress: orderRow.shippingAddress,
      billingAddress: orderRow.billingAddress,
      shippingMethod: orderRow.shippingMethod,
      utm: orderRow.utm as Record<string, string> | null,
      origin: orderRow.origin,
      deviceType: orderRow.deviceType,
      countryCode: orderRow.countryCode,
      internalNotes: orderRow.internalNotes,
      createdAt: orderRow.createdAt,
      updatedAt: orderRow.updatedAt,
      paidAt: orderRow.paidAt,
      cancelledAt: orderRow.cancelledAt,
      lastReminderSentAt: orderRow.lastReminderSentAt,
    },
    customer: customerRow
      ? {
          id: customerRow.id,
          name: [customerRow.firstName, customerRow.lastName].filter(Boolean).join(" ") || customerRow.email,
          email: customerRow.email,
          phone: customerRow.phone,
          document: customerRow.document,
          country: customerRow.country,
          marketingOptOut: customerRow.marketingOptOut,
          isBlocked: customerRow.isBlocked,
          createdAt: customerRow.createdAt,
        }
      : null,
    items: itemRows.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPriceCents: Number(i.unitPriceCents),
      totalCents: Number(i.totalCents),
    })),
    payments: paymentRows.map((p) => ({
      id: p.id,
      externalId: p.externalId,
      status: p.status,
      method: p.method,
      amountCents: Number(p.amountCents),
      feeCents: Number(p.feeCents),
      netCents: p.netCents === null ? null : Number(p.netCents),
      currency: p.currency,
      gateway: gatewayFromMetadata(p.metadata),
      cardBrand: p.cardBrand,
      cardLast4: p.cardLast4,
      pixQrCode: p.pixQrCode,
      boletoUrl: p.boletoUrl,
      failureReason: p.failureReason,
      approvedAt: p.approvedAt,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
    })),
    refunds: refundRows.map((r) => ({
      id: r.id,
      amountCents: Number(r.amountCents),
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
    })),
    chargebacks: chargebackRows.map((c) => ({
      id: c.id,
      amountCents: Number(c.amountCents),
      status: c.status,
      reason: c.reason,
      createdAt: c.createdAt,
    })),
    consents: consentRows.map((c) => ({
      type: c.type,
      granted: c.granted,
      source: c.source,
      createdAt: c.createdAt,
    })),
    timeline,
  };
}
