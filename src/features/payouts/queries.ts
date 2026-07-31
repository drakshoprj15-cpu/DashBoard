import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { payouts } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import type { PayoutStatus } from "@/features/payouts/status";

export interface PayoutRow {
  id: string;
  status: PayoutStatus;
  amountCents: number;
  currency: string;
  source: string;
  bankAccountLabel: string | null;
  expectedArrivalAt: Date | null;
  arrivedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface PayoutsSummary {
  paidCents: number;
  upcomingCents: number;
  nextPayout: { amountCents: number; expectedArrivalAt: Date | null } | null;
}

/** Repasses do workspace, mais recentes primeiro. */
export async function listPayouts(limit = 100): Promise<PayoutRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: payouts.id,
      status: payouts.status,
      amountCents: payouts.amountCents,
      currency: payouts.currency,
      source: payouts.source,
      bankAccountLabel: payouts.bankAccountLabel,
      expectedArrivalAt: payouts.expectedArrivalAt,
      arrivedAt: payouts.arrivedAt,
      failureReason: payouts.failureReason,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .where(eq(payouts.workspaceId, workspaceId))
    .orderBy(desc(payouts.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, amountCents: Number(r.amountCents) }));
}

export async function getPayoutsSummary(): Promise<PayoutsSummary> {
  if (!isDatabaseConfigured()) {
    return { paidCents: 0, upcomingCents: 0, nextPayout: null };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [totals] = await db
    .select({
      paidCents: sql<number>`coalesce(sum(${payouts.amountCents}) filter (where ${payouts.status} = 'paid'), 0)::int`,
      upcomingCents: sql<number>`coalesce(sum(${payouts.amountCents}) filter (where ${payouts.status} in ('upcoming','processing')), 0)::int`,
    })
    .from(payouts)
    .where(eq(payouts.workspaceId, workspaceId));

  const [next] = await db
    .select({
      amountCents: payouts.amountCents,
      expectedArrivalAt: payouts.expectedArrivalAt,
    })
    .from(payouts)
    .where(and(eq(payouts.workspaceId, workspaceId), eq(payouts.status, "upcoming")))
    .orderBy(asc(payouts.expectedArrivalAt))
    .limit(1);

  return {
    paidCents: totals?.paidCents ?? 0,
    upcomingCents: totals?.upcomingCents ?? 0,
    nextPayout: next ? { amountCents: Number(next.amountCents), expectedArrivalAt: next.expectedArrivalAt } : null,
  };
}
