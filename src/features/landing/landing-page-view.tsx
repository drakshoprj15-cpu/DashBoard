import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { techNebulaStore } from "@/features/landing/technebula-data";
import { getProductBySlug } from "@/features/landing/queries";
import { ProductLanding } from "@/features/landing/product-landing";
import { PixelScripts } from "@/features/pixels/pixel-scripts";
import { Tracker } from "@/features/analytics/tracker";
import { getPublishedReviews } from "@/features/reviews/queries";
import { CookieBanner } from "@/features/consent/cookie-banner";
import { getWorkspaceBranding } from "@/features/branding/queries";

/**
 * Landing page de um produto, com pixel, rastreio e banner de cookies.
 *
 * Compartilhada por duas rotas: `/p/[slug]` (qualquer domínio) e a raiz do
 * domínio próprio da loja (`src/app/page.tsx`), onde o slug vem do domínio
 * cadastrado em Landing pages → Domínios.
 */
export async function LandingPageView({ slug }: { slug: string }) {
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  // Avaliações vêm da tabela gerida no painel (Provas sociais).
  const [reviews, branding] = await Promise.all([
    getPublishedReviews(product.slug),
    getWorkspaceBranding(),
  ]);
  const withReviews = { ...product, reviews };

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
      <ProductLanding product={withReviews} branding={branding} />
      <CookieBanner />
    </>
  );
}

/**
 * Metadados da landing. `canonicalUrl` aponta para o endereço oficial da
 * página — o domínio próprio da loja quando existe — para que buscadores e
 * redes sociais não indexem a mesma página em dois domínios.
 */
export async function landingMetadata(
  slug: string,
  canonicalUrl?: string,
): Promise<Metadata> {
  const product = await getProductBySlug(slug);
  if (!product) {
    return { title: `Produto não encontrado · ${techNebulaStore.name}` };
  }

  return {
    title: `${product.name} · ${techNebulaStore.name}`,
    description: product.shortPitch,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
  };
}
