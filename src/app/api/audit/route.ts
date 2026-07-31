import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  getAuditSummary,
  listAuditLogs,
  listReceivedWebhooks,
} from "@/features/audit/queries";
import { isDashboardPeriod } from "@/features/dashboard/period";

export const dynamic = "force-dynamic";

/** Logs de auditoria: ações administrativas + webhooks recebidos. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const period = isDashboardPeriod(periodParam) ? periodParam : "30d";

  const [adminLogs, webhooks, summary] = await Promise.all([
    listAuditLogs(period),
    listReceivedWebhooks(period),
    getAuditSummary(period),
  ]);

  return NextResponse.json({ adminLogs, webhooks, summary });
}
