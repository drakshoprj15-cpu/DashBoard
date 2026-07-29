import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { alphaGamerNebula, techNebulaStore } from "@/features/landing/technebula-data";
import { getProductBySlug } from "@/features/landing/queries";
import { ProductLanding } from "@/features/landing/product-landing";
import { PixelScripts } from "@/features/pixels/pixel-scripts";
import { Tracker } from "@/features/analytics/tracker";

export const metadata: Metadata = {
  title: `${alphaGamerNebula.name} · ${techNebulaStore.name}`,
  description: alphaGamerNebula.shortPitch,
};

/**
 * Landing page pública TechNébula (rota /p/[slug]).
 * O produto vem do banco (tabela `products`); enquanto não houver seed,
 * cai para o catálogo estático em `technebula-data.ts`.
 */
export default async function AlphaGamerNebulaLandingPage() {
  const product = await getProductBySlug(alphaGamerNebula.slug);
  if (!product) notFound();

  return (
    <>
      <PixelScripts
        event="ViewContent"
        content={{
          id: product.slug,
          name: product.name,
          valueCents: product.priceCents,
          currency: product.currency,
        }}
      />
      <Tracker
        event="view_content"
        productSlug={product.slug}
        valueCents={product.priceCents}
        currency={product.currency}
      />
      <ProductLanding product={product} />
    </>
  );
}
