/**
 * Distinção entre o domínio do painel e os domínios próprios das lojas.
 *
 * A loja vive num domínio comprado à parte (ex.: pcdignetstore.online) para
 * que os anúncios nunca exponham o endereço administrativo — e para que um
 * bloqueio na loja não derrube o painel junto.
 *
 * Funções puras, sem I/O: são usadas no proxy, que roda em toda requisição.
 * A associação domínio → produto vem do banco, já dentro da página.
 */

/** Minúsculas, sem porta e sem o prefixo `www.` */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().split(":")[0].replace(/^www\./, "");
}

/**
 * O host pertence ao painel?
 *
 * Sem `PANEL_HOST` configurado, responde `true` para qualquer host: numa
 * instalação sem essa variável nada muda de comportamento e o painel nunca
 * fica inacessível por falta de configuração.
 *
 * Variável sem o prefixo `NEXT_PUBLIC_` de propósito: isto só roda no
 * servidor (proxy e server components), e não há motivo para embutir a
 * configuração no bundle do navegador.
 */
export function isPanelHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  if (normalized === "localhost" || normalized === "127.0.0.1") return true;
  // Domínios de deploy da Vercel (produção e previews) servem o painel.
  if (normalized.endsWith(".vercel.app")) return true;

  const panel = normalizeHost(process.env.PANEL_HOST);
  if (!panel) return true;
  return normalized === panel;
}

/**
 * Caminhos que um domínio de loja pode servir. Tudo o resto (painel, login,
 * APIs internas) é redirecionado para a raiz — o painel não existe para
 * quem chega pelo domínio da loja.
 */
const STORE_PREFIXES = [
  "/p/",
  "/pay/",
  "/checkout/",
  "/loja",
  "/legal/",
  "/api/public",
  // Webhooks continuam respondendo em qualquer host: são chamados por
  // servidores externos e a autenticidade vem da assinatura HMAC.
  "/api/webhooks/",
];

export function isStorePath(pathname: string): boolean {
  if (pathname === "/") return true;
  return STORE_PREFIXES.some(
    (prefix) =>
      pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}
