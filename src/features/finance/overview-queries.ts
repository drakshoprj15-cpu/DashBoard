import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { ledgerEntries, orders, payouts } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  getLedgerSummary,
  type LedgerSummary,
} from "@/features/ledger/queries";
import {
  resolvePeriodRange,
  type ChartGranularity,
  type DashboardPeriod,
} from "@/features/dashboard/period";

export interface FinanceChartPoint {
  label: string;
  inflowCents: number;
  outflowCents: number;
}

export interface FinanceOverview {
  currency: string;
  summary: LedgerSummary;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  nextPayout: { amountCents: number; expectedArrivalAt: Date | null } | null;
  chartSeries: FinanceChartPoint[];
  generatedAt: string;
}

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

/** Consolida o livro-caixa, pedidos e o próximo repasse — a "Visão Geral" do Financeiro. */
export async function getFinanceOverview(
  period: DashboardPeriod,
): Promise<FinanceOverview | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const range = resolvePeriodRange(period);
  const paidSql = sql`${orders.status} in ('paid','shipped','delivered')`;

  const [summary, ordersCounts, nextPayoutRow, seriesRows] = await Promise.all([
    getLedgerSummary(period),
    db
      .select({
        paid: sql<number>`count(*) filter (where ${paidSql})::int`,
        pending: sql<number>`count(*) filter (where ${orders.status} in ('created','awaiting_payment','processing'))::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.workspaceId, workspaceId),
          gte(orders.createdAt, range.start),
          lt(orders.createdAt, range.end),
        ),
      ),
    db
      .select({
        amountCents: payouts.amountCents,
        expectedArrivalAt: payouts.expectedArrivalAt,
      })
      .from(payouts)
      .where(
        and(
          eq(payouts.workspaceId, workspaceId),
          eq(payouts.status, "upcoming"),
        ),
      )
      .orderBy(payouts.expectedArrivalAt)
      .limit(1),
    db
      .select({
        bucket: sql<Date>`date_trunc(${
          range.granularity === "hour"
            ? "hour"
            : range.granularity === "week"
              ? "week"
              : "day"
        }, ${ledgerEntries.occurredAt} at time zone 'America/Sao_Paulo')`,
        inflowCents: sql<number>`coalesce(sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.direction} = 'in'), 0)::int`,
        outflowCents: sql<number>`coalesce(sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.direction} = 'out'), 0)::int`,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.workspaceId, workspaceId),
          eq(ledgerEntries.status, "confirmed"),
          gte(ledgerEntries.occurredAt, range.start),
          lt(ledgerEntries.occurredAt, range.end),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const chartSeries: FinanceChartPoint[] = seriesRows.map((r) => ({
    label: bucketLabel(new Date(r.bucket), range.granularity),
    inflowCents: r.inflowCents,
    outflowCents: r.outflowCents,
  }));

  const nextPayout = nextPayoutRow[0]
    ? {
        amountCents: Number(nextPayoutRow[0].amountCents),
        expectedArrivalAt: nextPayoutRow[0].expectedArrivalAt,
      }
    : null;

  return {
    currency: "EUR",
    summary,
    paidOrdersCount: ordersCounts[0]?.paid ?? 0,
    pendingOrdersCount: ordersCounts[0]?.pending ?? 0,
    nextPayout,
    chartSeries,
    generatedAt: new Date().toISOString(),
  };
}
