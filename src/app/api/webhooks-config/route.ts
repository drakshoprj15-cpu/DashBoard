import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { listWebhookDeliveries, listWebhookEndpoints } from "@/features/webhooks/queries";
import { listReceivedWebhooks } from "@/features/audit/queries";

export const dynamic = "force-dynamic";

/** Webhooks de saída (config + estatísticas) e, sob ?endpointId=, o histórico de um endpoint. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const endpointId = searchParams.get("endpointId");

  if (endpointId) {
    const deliveries = await listWebhookDeliveries(endpointId);
    return NextResponse.json({ deliveries });
  }

  const [endpoints, broskiEvents] = await Promise.all([
    listWebhookEndpoints(),
    // Janela ampla (90d) só para o resumo informativo do card da Broski.
    listReceivedWebhooks("90d", 1000),
  ]);

  const broskiInbound = {
    configured: Boolean(process.env.BROSKI_WEBHOOK_SECRET),
    eventsReceived: broskiEvents.length,
    lastEventAt: broskiEvents[0]?.createdAt.toISOString() ?? null,
  };

  return NextResponse.json({ endpoints, broskiInbound });
}
