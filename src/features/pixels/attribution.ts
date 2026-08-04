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

  return {
    fbp: cookieStore.get("_fbp")?.value ?? null,
    fbc: cookieStore.get("_fbc")?.value ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent") ?? null,
  };
}
