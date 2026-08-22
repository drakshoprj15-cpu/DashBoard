import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isPanelHost, isStorePath, normalizeHost } from "@/lib/hosts";

const PUBLIC_PREFIXES = [
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/auth",
  "/p/",
  "/lp/",
  "/pay/",
  // Página pública de um link de pagamento — quem vai pagar não tem sessão.
  "/pagar/",
  "/checkout/",
  "/loja",
  "/api/public",
  // Rotas de cron não têm sessão do painel. Cada uma valida CRON_SECRET.
  "/api/cron/",
  // Webhooks NUNCA podem exigir sessão: são chamados por servidores
  // externos (Broski, Resend...). A autenticidade é garantida pela
  // verificação de assinatura HMAC dentro de cada rota.
  "/api/webhooks/",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return false; // raiz redireciona para o painel
  return PUBLIC_PREFIXES.some(
    (prefix) =>
      pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}

/**
 * Proxy (Next 16, antigo middleware): separa os domínios das lojas do
 * domínio do painel, renova a sessão Supabase e protege as rotas
 * administrativas. Sem Supabase configurado, o painel abre em modo
 * demonstração (banner explícito na UI) — nada finge estar conectado.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = normalizeHost(request.headers.get("host"));

  // Domínio próprio de uma loja: só rotas públicas, e sem tocar na sessão
  // (poupa uma chamada ao Supabase em cada visita de cliente).
  if (!isPanelHost(host)) {
    if (!isStorePath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Modo demonstração: sem credenciais não há sessão a renovar.
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Importante: não executar lógica entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/cadastro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo exceto assets estáticos e imagens.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
