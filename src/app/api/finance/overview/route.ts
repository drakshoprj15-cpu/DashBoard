import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getFinanceOverview } from "@/features/finance/overview-queries";
import { isDashboardPeriod } from "@/features/dashboard/period";

export const dynamic = "force-dynamic";

/** Visão Geral do Financeiro: consolida livro-caixa, pedidos e próximo repasse. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const period = isDashboardPeriod(periodParam) ? periodParam : "30d";

  const overview = await getFinanceOverview(period);

  if (!overview) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  }

  return NextResponse.json(overview);
}
