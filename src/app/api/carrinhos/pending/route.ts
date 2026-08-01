import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/database/client";
import { listPendingReminderCandidates } from "@/features/carts/queries";
import { parseCartFilters } from "@/app/api/carrinhos/filters";

export const dynamic = "force-dynamic";

/**
 * Candidatos ao lembrete em massa (aguardando pagamento + pendente +
 * abandonado), respeitando os filtros atuais — usado pelo botão "Enviar
 * lembrete aos pendentes" para montar a confirmação antes do disparo.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseCartFilters(searchParams);
  const candidates = await listPendingReminderCandidates(filters, 200);

  return NextResponse.json(candidates);
}
