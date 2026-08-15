import "server-only";

import { getAppUrl } from "@/lib/app-url";

/**
 * Imagens da página de pagamento só podem vir dos storages usados pela
 * própria instalação. Isso impede que uma request adulterada grave um pixel
 * de tracking ou uma imagem remota controlada por terceiros.
 */
export function isTrustedPaymentAssetUrl(
  value: string | null | undefined,
): boolean {
  if (!value) return true;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;

    const allowedHosts = new Set<string>();
    for (const configured of [
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      getAppUrl(),
    ]) {
      if (!configured) continue;
      try {
        allowedHosts.add(new URL(configured).hostname.toLowerCase());
      } catch {
        // Configuração inválida não alarga a allowlist.
      }
    }

    const host = url.hostname.toLowerCase();
    return (
      allowedHosts.has(host) ||
      (host.endsWith(".supabase.co") &&
        url.pathname.startsWith("/storage/v1/object/public/")) ||
      host.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export function validatePaymentLinkAssetUrls(input: {
  logoUrl?: string;
  faviconUrl?: string;
  seoFaviconUrl?: string;
  productImageUrl?: string;
}): string | null {
  const entries = [
    ["logo", input.logoUrl],
    ["favicon", input.faviconUrl],
    ["favicon de SEO", input.seoFaviconUrl],
    ["imagem do produto", input.productImageUrl],
  ] as const;

  for (const [label, value] of entries) {
    if (!isTrustedPaymentAssetUrl(value)) {
      return `A ${label} precisa ser enviada pelo upload seguro do Infinity.`;
    }
  }
  return null;
}
