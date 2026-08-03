import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAppUrl } from "@/lib/app-url";
import { CookieBanner } from "@/features/consent/cookie-banner";
import { PixelScripts } from "@/features/pixels/pixel-scripts";
import { getPublishedReviews } from "@/features/reviews/queries";
import {
  getLandingPreviewByToken,
  getPublishedLandingBySlug,
  type PublicLandingPage,
} from "@/features/landing-pages/queries";
import { LandingRenderer } from "@/features/landing-pages/render/landing-renderer";
import {
  LandingCustomCodeBottom,
  LandingCustomCodeTop,
  LandingPixels,
} from "@/features/landing-pages/render/landing-pixels";
import type { LandingSnapshot } from "@/features/landing-pages/types";

/**
 * A página é servida do banco, não do build: publicar uma alteração no painel
 * não exige novo deploy da aplicação.
 *
 * A rota é dinâmica por natureza — lê `searchParams` para preservar as UTMs
 * do anúncio e para o token de pré-visualização —, então cada visita consulta
 * o banco. É o comportamento desejado aqui: preço e estoque de uma página de
 * anúncio não podem ficar presos num cache de minutos.
 */
export const dynamic = "force-dynamic";

interface ResolvedLanding {
  page: PublicLandingPage | null;
  /** true só quando o token conferiu e o que está a ser servido é o rascunho */
  isPreview: boolean;
}

async function resolvePage(
  slug: string,
  previewToken: string | undefined,
): Promise<ResolvedLanding> {
  if (previewToken) {
    // Token inválido ou já rodado não pode transformar uma página no ar em
    // 404: um link antigo de pré-visualização cai na versão publicada.
    const preview = await getLandingPreviewByToken(slug, previewToken);
    if (preview) return { page: preview, isPreview: true };
  }
  return { page: await getPublishedLandingBySlug(slug), isPreview: false };
}

function asString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function generateMetadata(
  props: PageProps<"/lp/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const { page, isPreview } = await resolvePage(
    slug,
    asString(searchParams.preview),
  );

  if (!page) return { title: "Página não encontrada" };

  const { snapshot } = page;
  const product = page.liveProduct ?? snapshot.product;
  const seo = snapshot.seo;

  const title = seo.title || product?.name || snapshot.publicName;
  const description =
    seo.description || product?.shortDescription || snapshot.publicName;
  const canonical = seo.canonicalUrl || `${getAppUrl()}/lp/${slug}`;
  const image = seo.shareImageUrl || product?.mainImageUrl || undefined;

  // O preview privado nunca pode ser indexado, aconteça o que acontecer com
  // a configuração de SEO da página.
  const noIndex = seo.noIndex || isPreview;

  return {
    title,
    description,
    keywords: seo.keywords || undefined,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : undefined,
    icons: snapshot.faviconUrl ? { icon: snapshot.faviconUrl } : undefined,
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: snapshot.publicName,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: seo.twitterCard,
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** Dados estruturados de produto para os resultados de busca. */
function productJsonLd(snapshot: LandingSnapshot, canonical: string) {
  const product = snapshot.product;
  if (!product || !snapshot.seo.productSchema) return null;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription || undefined,
    image: product.gallery.length > 0 ? product.gallery : undefined,
    sku: product.slug,
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: product.currency,
      price: (product.priceCents / 100).toFixed(2),
      availability:
        product.trackInventory && product.stockQuantity <= 0
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
    },
  };
}

export default async function PublicLandingPageRoute(
  props: PageProps<"/lp/[slug]">,
) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const { page, isPreview } = await resolvePage(
    slug,
    asString(searchParams.preview),
  );
  if (!page) notFound();

  const { snapshot } = page;

  // Com sincronização ligada, preço, estoque e imagens vêm do catálogo na
  // hora da visita — mudar o preço do produto não exige republicar a página.
  const product = page.liveProduct ?? snapshot.product;

  // Blocos ocultos nem chegam ao navegador: além de não serem desenhados,
  // não entram no conteúdo enviado ao cliente.
  const effectiveSnapshot: LandingSnapshot = {
    ...snapshot,
    product,
    content: {
      blocks: snapshot.content.blocks.filter((block) => !block.hidden),
    },
  };

  const reviews = product ? await getPublishedReviews(product.slug) : [];
  const canonical = snapshot.seo.canonicalUrl || `${getAppUrl()}/lp/${slug}`;
  const jsonLd = productJsonLd(effectiveSnapshot, canonical);

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      {snapshot.tracking.inheritWorkspacePixels ? (
        <PixelScripts
          event="ViewContent"
          content={
            product
              ? {
                  id: product.slug,
                  name: product.name,
                  valueCents: product.priceCents,
                  currency: product.currency,
                }
              : undefined
          }
        />
      ) : null}

      <LandingPixels tracking={snapshot.tracking} pageId={page.id} />
      <LandingCustomCodeTop code={snapshot.customCode} pageId={page.id} />

      {isPreview ? (
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">
          Pré-visualização privada do rascunho — esta versão ainda não está
          publicada e não é indexada por buscadores.
        </div>
      ) : null}

      <LandingRenderer
        snapshot={effectiveSnapshot}
        reviews={reviews}
        pageId={page.id}
      />

      <LandingCustomCodeBottom code={snapshot.customCode} />
      <CookieBanner />
    </>
  );
}
