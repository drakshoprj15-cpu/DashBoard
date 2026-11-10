/**
 * Endereços públicos saem sempre em HTTPS.
 *
 * Um link `http://` num e-mail ou num redirecionamento de checkout faz o
 * navegador mostrar "ligação não segura" (ou bloquear a página como conteúdo
 * misto) justamente no passo em que o cliente vai pagar. Este módulo é o
 * único sítio que decide o protocolo; não depende de nada do servidor, por
 * isso pode ser usado também no navegador.
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const PRIVATE_IPV4_PATTERN =
  /^(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Desenvolvimento local é a única exceção: não existe certificado ali.
 * Inclui os IPs de rede privada, usados para testar no telemóvel.
 */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(host) || PRIVATE_IPV4_PATTERN.test(host);
}

/**
 * Devolve o endereço em HTTPS, ou `null` quando ele não serve como link.
 *
 * - `http://` é promovido a `https://`;
 * - endereço sem protocolo (`loja.pt/pagar/abc`) recebe `https://`;
 * - qualquer outro protocolo (`javascript:`, `data:`, `mailto:`…) é recusado;
 * - credenciais embutidas (`https://banco.pt@outro.site`) são recusadas,
 *   porque escondem o destino real de quem lê o endereço.
 */
export function toSecureUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw || /\s/.test(raw)) return null;

  const explicitScheme = SCHEME_PATTERN.test(raw);
  const candidate = raw.startsWith("//")
    ? `https:${raw}`
    : explicitScheme
      ? raw
      : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  const local = isLocalHostname(url.hostname);
  // Sem protocolo, só aceitamos o que parece mesmo um domínio — senão uma
  // palavra solta como "checkout" viraria `https://checkout`.
  if (!explicitScheme && !local && !url.hostname.includes(".")) return null;

  if (url.protocol === "https:") {
    return candidate === raw ? raw : url.toString();
  }
  if (url.protocol !== "http:") return null;
  if (local) return raw;

  url.protocol = "https:";
  return url.toString();
}

/**
 * Versão tolerante para URLs base geradas pela própria aplicação: promove
 * `http://` a `https://` e devolve o valor original se não conseguir ler.
 */
export function enforceHttps(value: string): string {
  return toSecureUrl(value) ?? value;
}
