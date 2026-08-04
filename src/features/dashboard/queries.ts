import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  analyticsEvents,
  customers,
  orderItems,
  orders,
  payments,
  products,
  refunds,
  visitorSessions,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getPendingCartsCount } from "@/features/carts/queries";
import { PAID_STATUSES, STATUS_LABEL } from "@/features/orders/status";
import {
  percentChange,
  resolvePeriodRange,
  type ChartGranularity,
  type DashboardPeriod,
} from "@/features/dashboard/period";

const PAID_SQL = sql`${orders.status} in ('paid','shipped','delivered')`;

export interface ChartPoint {
  /** Rótulo já pronto para eixo X (hora, dia ou semana, pt-BR). */
  label: string;
  bucketStart: Date;
  revenueCents: number;
  orders: number;
}

export interface TopProductRow {
  productId: string | null;
  name: string;
  imageUrl: string | null;
  units: number;
  revenueCents: number;
}

export interface RecentOrderRow {
  id: string;
  reference: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: Date;
  customerName: string | null;
  productName: string | null;
  quantity: number | null;
  paymentMethod: string | null;
}

export interface FunnelStepRow {
  label: string;
  event: string;
  count: number;
}

export interface PaymentMethodRow {
  method: string;
  label: string;
  count: number;
  amountCents: number;
}

export interface OperationalAlert {
  key: string;
  title: string;
  count: number;
  href: string;
}

export interface DashboardSnapshot {
  currency: string;
  period: DashboardPeriod;
  granularity: ChartGranularity;

  revenueCents: number;
  revenueChangePercent: number | null;

  ordersCount: number;
  ordersChangePercent: number | null;
  paidOrdersCount: number;

  averageTicketCents: number | null;
  averageTicketChangePercent: number | null;

  /** null = sem sessões suficientes para calcular conversão no período. */
  conversionRate: number | null;
  conversionChangePercent: number | null;

  chartSeries: ChartPoint[];
  topProducts: TopProductRow[];

  todayRevenueCents: number;
  todayOrdersCount: number;
  customersCount: number;
  abandonedCartsCount: number;

  recentOrders: RecentOrderRow[];
  funnel: FunnelStepRow[];
  paymentMethods: PaymentMethodRow[];
  alerts: OperationalAlert[];

  generatedAt: string;
}

const METHOD_LABEL: Record<string, string> = {
  mbway: "MB WAY",
  multibanco: "Multibanco",
  card: "Cartão",
  pix: "Pix",
  boleto: "Boleto",
};

function bucketLabel(date: Date, granularity: ChartGranularity): string {
  if (granularity === "hour") {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(date);
  }
  if (granularity === "week") {
    return `Sem. ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(date)}`;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

/** Receita paga menos reembolsos concluídos na janela — nunca receita bruta. */
async function getNetRevenue(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  start: Date,
  end: Date,
): Promise<{ grossCents: number; ordersCount: number; refundedCents: number }> {
  const [gross] = await db
    .select({
      grossCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${PAID_SQL}), 0)::int`,
      ordersCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    );

  const [refunded] = await db
    .select({
      refundedCents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int`,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.workspaceId, workspaceId),
        eq(refunds.status, "completed"),
        gte(refunds.completedAt, start),
        lt(refunds.completedAt, end),
      ),
    );

  return {
    grossCents: gross?.grossCents ?? 0,
    ordersCount: gross?.ordersCount ?? 0,
    refundedCents: refunded?.refundedCents ?? 0,
  };
}

export async function getDashboardSnapshot(
  period: DashboardPeriod,
  now: Date = new Date(),
): Promise<DashboardSnapshot | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const range = resolvePeriodRange(period, now);
  const ws = eq(orders.workspaceId, workspaceId);

  const [current, previous] = await Promise.all([
    getNetRevenue(db, workspaceId, range.start, range.end),
    getNetRevenue(db, workspaceId, range.previousStart, range.previousEnd),
  ]);

  const revenueCents = Math.max(0, current.grossCents - current.refundedCents);
  const previousRevenueCents = Math.max(
    0,
    previous.grossCents - previous.refundedCents,
  );

  const [paidCurrent, paidPrevious] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          ws,
          PAID_SQL,
          gte(orders.createdAt, range.start),
          lt(orders.createdAt, range.end),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          ws,
          PAID_SQL,
          gte(orders.createdAt, range.previousStart),
          lt(orders.createdAt, range.previousEnd),
        ),
      ),
  ]);

  const paidOrdersCount = paidCurrent[0]?.n ?? 0;
  const paidOrdersPrevious = paidPrevious[0]?.n ?? 0;

  const averageTicketCents =
    paidOrdersCount > 0 ? Math.round(revenueCents / paidOrdersCount) : null;
  const averageTicketPrevious =
    paidOrdersPrevious > 0
      ? Math.round(previousRevenueCents / paidOrdersPrevious)
      : null;

  // Conversão: pedidos pagos ÷ sessões únicas no período. Sem sessões, não
  // há denominador válido — o card mostra "—" em vez de inventar uma taxa.
  const [sessionsCurrent, sessionsPrevious] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(visitorSessions)
      .where(
        and(
          eq(visitorSessions.workspaceId, workspaceId),
          gte(visitorSessions.createdAt, range.start),
          lt(visitorSessions.createdAt, range.end),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(visitorSessions)
      .where(
        and(
          eq(visitorSessions.workspaceId, workspaceId),
          gte(visitorSessions.createdAt, range.previousStart),
          lt(visitorSessions.createdAt, range.previousEnd),
        ),
      ),
  ]);

  const sessionsCount = sessionsCurrent[0]?.n ?? 0;
  const sessionsCountPrevious = sessionsPrevious[0]?.n ?? 0;
  const conversionRate =
    sessionsCount > 0 ? paidOrdersCount / sessionsCount : null;
  const conversionPrevious =
    sessionsCountPrevious > 0
      ? paidOrdersPrevious / sessionsCountPrevious
      : null;

  // Série do gráfico: agregada no fuso America/Sao_Paulo pelo bucket certo.
  const truncUnit =
    range.granularity === "hour"
      ? "hour"
      : range.granularity === "week"
        ? "week"
        : "day";
  const seriesRows = await db
    .select({
      bucket: sql<Date>`date_trunc(${truncUnit}, ${orders.createdAt} at time zone 'America/Sao_Paulo')`,
      revenueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${PAID_SQL}), 0)::int`,
      ordersCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        ws,
        gte(orders.createdAt, range.start),
        lt(orders.createdAt, range.end),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const chartSeries: ChartPoint[] = seriesRows.map((r) => ({
    label: bucketLabel(new Date(r.bucket), range.granularity),
    bucketStart: new Date(r.bucket),
    revenueCents: r.revenueCents,
    orders: r.ordersCount,
  }));

  // Top produtos: itens de pedidos pagos no período.
  const topProductRows = await db
    .select({
      productId: orderItems.productId,
      name: orderItems.productName,
      imageUrl: products.mainImageUrl,
      units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      revenueCents: sql<number>`coalesce(sum(${orderItems.totalCents}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        ws,
        PAID_SQL,
        gte(orders.createdAt, range.start),
        lt(orders.createdAt, range.end),
      ),
    )
    .groupBy(
      orderItems.productId,
      orderItems.productName,
      products.mainImageUrl,
    )
    .orderBy(desc(sql`sum(${orderItems.totalCents})`))
    .limit(5);

  const topProducts: TopProductRow[] = topProductRows.map((r) => ({
    productId: r.productId,
    name: r.name,
    imageUrl: r.imageUrl,
    units: r.units,
    revenueCents: r.revenueCents,
  }));

  // Indicadores de hoje (sempre hoje, independente do período selecionado).
  const todayRange = resolvePeriodRange("today", now);
  const [todayRow] = await db
    .select({
      revenueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${PAID_SQL}), 0)::int`,
      ordersCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(ws, gte(orders.createdAt, todayRange.start)));

  // Clientes únicos com pedido no período (não apenas clientes cadastrados).
  const [customersRow] = await db
    .select({ n: sql<number>`count(distinct ${orders.customerId})::int` })
    .from(orders)
    .where(
      and(
        ws,
        gte(orders.createdAt, range.start),
        lt(orders.createdAt, range.end),
        sql`${orders.customerId} is not null`,
      ),
    );

  // Pedidos ainda não resolvidos (nem pagos, nem perdidos) — mesma regra usada em /carrinhos.
  const pendingCartsCount = await getPendingCartsCount();

  // Pedidos recentes.
  const recentRows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      totalCents: orders.totalCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
      customerFirst: customers.firstName,
      customerLast: customers.lastName,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      paymentMethod: payments.method,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(ws)
    .orderBy(desc(orders.createdAt))
    .limit(24);

  const seenOrders = new Set<string>();
  const recentOrders: RecentOrderRow[] = [];
  for (const r of recentRows) {
    if (seenOrders.has(r.id)) continue;
    seenOrders.add(r.id);
    recentOrders.push({
      id: r.id,
      reference: r.reference,
      status: r.status,
      totalCents: Number(r.totalCents),
      currency: r.currency,
      createdAt: r.createdAt,
      customerName:
        [r.customerFirst, r.customerLast].filter(Boolean).join(" ") || null,
      productName: r.productName,
      quantity: r.quantity,
      paymentMethod: r.paymentMethod,
    });
    if (recentOrders.length >= 8) break;
  }

  // Funil de vendas: mesmos eventos do Live View, agregados pelo período.
  const funnelRows = await db
    .select({
      eventName: analyticsEvents.eventName,
      n: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.workspaceId, workspaceId),
        gte(analyticsEvents.occurredAt, range.start),
        lt(analyticsEvents.occurredAt, range.end),
      ),
    )
    .groupBy(analyticsEvents.eventName);

  const countOf = (name: string) =>
    funnelRows.find((r) => r.eventName === name)?.n ?? 0;

  const funnel: FunnelStepRow[] = [
    { label: "Visitantes", event: "page_view", count: countOf("page_view") },
    {
      label: "Produto visualizado",
      event: "view_content",
      count: countOf("view_content"),
    },
    {
      label: "Checkout iniciado",
      event: "checkout_opened",
      count: countOf("checkout_opened"),
    },
    {
      label: "Pagamento aprovado",
      event: "payment_created",
      count: countOf("payment_created"),
    },
  ];

  // Formas de pagamento: participação por método no período.
  const paymentRows = await db
    .select({
      method: payments.method,
      count: sql<number>`count(*)::int`,
      amountCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.workspaceId, workspaceId),
        gte(payments.createdAt, range.start),
        lt(payments.createdAt, range.end),
      ),
    )
    .groupBy(payments.method)
    .orderBy(desc(sql`sum(${payments.amountCents})`));

  const paymentMethods: PaymentMethodRow[] = paymentRows.map((r) => ({
    method: r.method,
    label: METHOD_LABEL[r.method] ?? r.method,
    count: r.count,
    amountCents: r.amountCents,
  }));

  // Alertas operacionais: só o que é real — nada de placeholder inventado.
  const alerts: OperationalAlert[] = [];

  const [pendingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(ws, sql`${orders.status} in ('awaiting_payment','processing')`));
  if ((pendingRow?.n ?? 0) > 0) {
    alerts.push({
      key: "pending_payments",
      title: "Pagamentos pendentes",
      count: pendingRow.n,
      href: "/pedidos",
    });
  }

  const [preparingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(ws, eq(orders.status, "paid")));
  if ((preparingRow?.n ?? 0) > 0) {
    alerts.push({
      key: "awaiting_shipment",
      title: "Pedidos aguardando envio",
      count: preparingRow.n,
      href: "/pedidos",
    });
  }

  const [lowStockRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.workspaceId, workspaceId),
        eq(products.type, "physical"),
        eq(products.trackInventory, true),
        sql`${products.stockQuantity} > 0`,
        sql`${products.minStockAlert} is not null`,
        sql`${products.stockQuantity} <= ${products.minStockAlert}`,
      ),
    );
  if ((lowStockRow?.n ?? 0) > 0) {
    alerts.push({
      key: "low_stock",
      title: "Produtos com estoque baixo",
      count: lowStockRow.n,
      href: "/catalogo/estoque",
    });
  }

  const [outOfStockRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.workspaceId, workspaceId),
        eq(products.type, "physical"),
        eq(products.trackInventory, true),
        eq(products.stockQuantity, 0),
        eq(products.status, "active"),
      ),
    );
  if ((outOfStockRow?.n ?? 0) > 0) {
    alerts.push({
      key: "out_of_stock",
      title: "Produtos sem estoque",
      count: outOfStockRow.n,
      href: "/catalogo/estoque",
    });
  }

  if (pendingCartsCount > 0) {
    alerts.push({
      key: "abandoned_carts",
      title: "Carrinhos abandonados",
      count: pendingCartsCount,
      href: "/carrinhos",
    });
  }

  return {
    currency: "EUR",
    period,
    granularity: range.granularity,

    revenueCents,
    revenueChangePercent: percentChange(revenueCents, previousRevenueCents),

    ordersCount: current.ordersCount,
    ordersChangePercent: percentChange(
      current.ordersCount,
      previous.ordersCount,
    ),
    paidOrdersCount,

    averageTicketCents,
    averageTicketChangePercent:
      averageTicketCents !== null && averageTicketPrevious !== null
        ? percentChange(averageTicketCents, averageTicketPrevious)
        : null,

    conversionRate,
    conversionChangePercent:
      conversionRate !== null && conversionPrevious !== null
        ? percentChange(conversionRate, conversionPrevious)
        : null,

    chartSeries,
    topProducts,

    todayRevenueCents: todayRow?.revenueCents ?? 0,
    todayOrdersCount: todayRow?.ordersCount ?? 0,
    customersCount: customersRow?.n ?? 0,
    abandonedCartsCount: pendingCartsCount,

    recentOrders,
    funnel,
    paymentMethods,
    alerts,

    generatedAt: new Date().toISOString(),
  };
}

export { STATUS_LABEL, PAID_STATUSES };
