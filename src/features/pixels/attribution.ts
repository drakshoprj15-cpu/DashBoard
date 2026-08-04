import { cookies, headers } from "next/headers";

import type { PurchaseAttribution } from "@/features/pixels/meta-capi";

/**
 * Captura a atribuição da Meta disponível na requisição atual (cookies
 * `_fbp`/`_fbc`, já definidos pelo `fbevents.js` oficial carregado em
 * `pixel-scripts.tsx` — não precisamos gerá-los, só ler — mais IP/user
 * agent). Chamada só dentro de uma Server Action com contexto de
 * requisição (ex.: `submitCheckoutAction`) — o webhook do gateway não tem
 * cookies, por isso o resultado é persistido no pedido para reuso posterior.
 */
export async function captureRequestAttribution(): Promise<PurchaseAttribution> {
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  const sourceUrl = h.get("referer");
  let fbc = cookieStore.get("_fbc")?.value ?? null;

  // Alguns navegadores bloqueiam o cookie antes do submit. Quando o clique
  // da Meta ainda está na URL, preserva o identificador no formato oficial.
  if (!fbc && sourceUrl) {
    try {
      const fbclid = new URL(sourceUrl).searchParams.get("fbclid");
      if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    } catch {
      // Referer inválido não pode interferir no checkout.
    }
  }

  return {
    fbp: cookieStore.get("_fbp")?.value ?? null,
    fbc,
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null,
    userAgent: h.get("user-agent") ?? null,
    sourceUrl,
  };
}
