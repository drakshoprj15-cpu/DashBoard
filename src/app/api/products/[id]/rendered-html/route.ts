import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getProductById } from "@/features/products/queries";
import { getVerifiedDomainForProductSlug } from "@/features/domains/queries";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * HTML final da landing page pública de um produto — usado pela aba
 * "Código" para mostrar o código real da página (nunca uma cópia
 * reconstruída). `getProductById` já filtra pelo workspace da sessão, então
 * um ID de produto de outro workspace simplesmente não é encontrado.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/products/[id]/rendered-html">) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const product = await getProductById(id);
  if (!product) {
    return NextResponse.json(
      { ok: false, error: "Produto não encontrado." },
      { status: 404 },
    );
  }

  if (product.status !== "active") {
    return NextResponse.json({
      ok: false,
      notPublished: true,
      error: "Esta landing page ainda não foi publicada. Ative o produto para gerar o código.",
    });
  }

  const hostname = await getVerifiedDomainForProductSlug(product.slug);
  const url = hostname ? `https://${hostname}/` : `${getAppUrl()}/p/${product.slug}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "x-panel-preview": "1" },
    });

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `Não foi possível carregar a página publicada (HTTP ${res.status}).`,
      });
    }

    const html = await res.text();
    return NextResponse.json({ ok: true, html, url });
  } catch (error) {
    console.error("[custom-code] erro ao buscar HTML publicado:", error);
    return NextResponse.json({
      ok: false,
      error: "Não foi possível carregar o código agora. Tente novamente.",
    });
  }
}
