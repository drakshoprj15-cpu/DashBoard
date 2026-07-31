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

export async function generateMetadata(
  props: PageProps<"/p/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return { title: `Produto não encontrado · ${techNebulaStore.name}` };
  }
  return {
    title: `${product.name} · ${techNebulaStore.name}`,
    description: product.shortPitch,
  };
}

/**
 * Landing page pública (rota /p/[slug]).
 * O produto vem do banco (tabela `products`); enquanto não houver produto
 * cadastrado com esse slug, cai para o catálogo estático em
 * `technebula-data.ts` (mantém o link antigo da cadeira ALPHA GAMER vivo).
 */
export default async function ProductLandingPage(
  props: PageProps<"/p/[slug]">,
) {
  const { slug } = await props.params;
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
