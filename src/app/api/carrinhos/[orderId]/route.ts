import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/database/client";
import { getCartDetail } from "@/features/carts/queries";

export const dynamic = "force-dynamic";

/**
 * Detalhe de um carrinho/pedido para o drawer. `getCartDetail` já escopa a
 * consulta ao workspace da sessão — um id de outro workspace simplesmente
 * não é encontrado (nunca um 403 que confirme a existência do registo).
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/carrinhos/[orderId]">,
) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { orderId } = await ctx.params;
  const detail = await getCartDetail(orderId);

  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
