import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/database/client";
import {
  getLandingPageMetaSettings,
  landingPageBelongsToWorkspace,
  listLandingPagePixels,
} from "@/features/pixels/queries";

export const dynamic = "force-dynamic";

/**
 * Configuração Meta (pixels + regra de Purchase) de uma landing page,
 * buscada sob demanda pelo seletor no painel (com abort de requisição
 * anterior ao trocar de página rapidamente).
 *
 * `landingPageId` nunca é confiado só porque veio da URL — se não pertencer
 * ao workspace da sessão, devolve 404 genérico (nunca um 403 que confirme
 * a existência do registro em outra conta), mesmo padrão de
 * `app/api/carrinhos/[orderId]/route.ts`.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/pixel/meta/landing-page/[landingPageId]">,
) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  }

  const { landingPageId } = await ctx.params;

  const owned = await landingPageBelongsToWorkspace(landingPageId);
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [pixels, purchaseRule] = await Promise.all([
    listLandingPagePixels(landingPageId),
    getLandingPageMetaSettings(landingPageId),
  ]);

  return NextResponse.json({ pixels, purchaseRule });
}
