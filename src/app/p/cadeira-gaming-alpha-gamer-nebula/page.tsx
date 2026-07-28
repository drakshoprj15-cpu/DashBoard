import type { Metadata } from "next";

import { alphaGamerNebula, techNebulaStore } from "@/features/landing/technebula-data";
import { ProductLanding } from "@/features/landing/product-landing";

export const metadata: Metadata = {
  title: `${alphaGamerNebula.name} · ${techNebulaStore.name}`,
  description: alphaGamerNebula.shortPitch,
};

/**
 * Landing page pública TechNébula (rota /p/[slug]).
 * Versão estática em código; será migrada para o editor por blocos na Fase 8.
 */
export default function AlphaGamerNebulaLandingPage() {
  return <ProductLanding product={alphaGamerNebula} />;
}
