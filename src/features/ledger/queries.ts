import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { ledgerEntries } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  resolvePeriodRange,
  type DashboardPeriod,
} from "@/features/dashboard/period";
import type { LedgerEntryType } from "@/features/ledger/entry-type";

export type LedgerDirectionFilter = "all" | "in" | "out";

export interface LedgerEntryRow {
  id: string;
  type: LedgerEntryType;
  direction: "in" | "out";
  description: string;
  category: string | null;
  amountCents: number;
  currency: string;
  status: string;
  orderId: string | null;
  occurredAt: Date;
}

export interface LedgerSummary {
  inflowCents: number;
  outflowCents: number;
  balanceCents: number;
}

/** Lançamentos do workspace no período, mais recentes primeiro. */
export async function listLedgerEntries(
  period: DashboardPeriod,
  direction: LedgerDirectionFilter = "all",
  limit = 100,
): Promise<LedgerEntryRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const range = resolvePeriodRange(period);

  const rows = await db
    .select({
      id: ledgerEntries.id,
      type: ledgerEntries.type,
      direction: ledgerEntries.direction,
      description: ledgerEntries.description,
      category: ledgerEntries.category,
      amountCents: ledgerEntries.amountCents,
      currency: ledgerEntries.currency,
      status: ledgerEntries.status,
      orderId: ledgerEntries.orderId,
      occurredAt: ledgerEntries.occurredAt,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.workspaceId, workspaceId),
        gte(ledgerEntries.occurredAt, range.start),
        lt(ledgerEntries.occurredAt, range.end),
        direction === "all" ? undefined : eq(ledgerEntries.direction, direction),
      ),
    )
    .orderBy(desc(ledgerEntries.occurredAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    amountCents: Number(r.amountCents),
  }));
}

/** Total de entradas, saídas e saldo do período — soma agregada no servidor. */
export async function getLedgerSummary(period: DashboardPeriod): Promise<LedgerSummary> {
  if (!isDatabaseConfigured()) {
    return { inflowCents: 0, outflowCents: 0, balanceCents: 0 };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const range = resolvePeriodRange(period);

  const [row] = await db
    .select({
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
    );

  const inflowCents = row?.inflowCents ?? 0;
  const outflowCents = row?.outflowCents ?? 0;

  return {
    inflowCents,
    outflowCents,
    balanceCents: inflowCents - outflowCents,
  };
}
