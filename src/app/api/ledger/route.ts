import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  getLedgerSummary,
  listLedgerEntries,
  type LedgerDirectionFilter,
} from "@/features/ledger/queries";
import { isDashboardPeriod } from "@/features/dashboard/period";

export const dynamic = "force-dynamic";

function isDirectionFilter(value: string | null): value is LedgerDirectionFilter {
  return value === "all" || value === "in" || value === "out";
}

/** Lançamentos e resumo do livro-caixa (Financeiro → Entradas/Saídas). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const period = isDashboardPeriod(periodParam) ? periodParam : "30d";
  const directionParam = searchParams.get("direction");
  const direction = isDirectionFilter(directionParam) ? directionParam : "all";

  const [entries, summary] = await Promise.all([
    listLedgerEntries(period, direction),
    getLedgerSummary(period),
  ]);

  return NextResponse.json({ entries, summary });
}
