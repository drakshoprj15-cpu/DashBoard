import { headers } from "next/headers";

import { getAppUrl } from "@/lib/app-url";

/**
 * URL base do domínio pelo qual esta requisição chegou.
 *
 * Diferente de `getAppUrl()`, que devolve sempre o domínio global da
 * aplicação: com domínios próprios por loja, um cliente que compra em
 * `pcdignetstore.online` precisa continuar nesse domínio até o fim do
 * pagamento — nunca ser jogado para o endereço do painel.
 *
 * Fica separado de `app-url.ts` porque depende de `next/headers`, e aquele
 * módulo é importado por código que não roda dentro de uma requisição.
 */
export async function getRequestUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return getAppUrl();

  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${proto}://${host}`;
}
