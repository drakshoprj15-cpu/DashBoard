export interface FallbackPixelCandidate {
  landingPageId: string | null;
  isActive: boolean;
}

/**
 * Regra de fallback dos pixels Meta: se a landing page tiver pixels ativos
 * próprios do tipo pedido, usa só esses; senão cai nos pixels globais ativos
 * do workspace (`landingPageId` nulo).
 *
 * Pura — sem acesso a banco — para ser testável isoladamente e reutilizada
 * tanto pela renderização pública (`pixel-scripts.tsx`) quanto pela
 * Conversions API (`meta-capi.ts`), garantindo que as duas nunca divirjam.
 */
export function pickEffectivePixels<T extends FallbackPixelCandidate>(
  candidatesOfType: T[],
  landingPageId: string | null,
): T[] {
  if (landingPageId) {
    const specific = candidatesOfType.filter(
      (p) => p.landingPageId === landingPageId && p.isActive,
    );
    if (specific.length > 0) return specific;
  }
  return candidatesOfType.filter(
    (p) => p.landingPageId === null && p.isActive,
  );
}
