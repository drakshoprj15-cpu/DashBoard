import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProductBySlug } from "@/features/landing/queries";
import { CheckoutForm } from "@/features/checkout/checkout-form";
import { PixelScripts } from "@/features/pixels/pixel-scripts";
import { Tracker } from "@/features/analytics/tracker";
import { CookieBanner } from "@/features/consent/cookie-banner";
import { listActiveShippingMethods } from "@/features/shipping/queries";
import {
  DEFAULT_CHECKOUT_THEME,
  getPublishedCheckoutBySlug,
} from "@/features/checkouts/queries";
import { STANDARD_STOREFRONT } from "@/features/storefront/standard-brand";
import {
  listCheckoutVariants,
  pickDefaultVariant,
} from "@/features/variants/resolve";

export const metadata: Metadata = {
  title: `Checkout · ${STANDARD_STOREFRONT.name}`,
};

/**
 * Checkout público (/checkout/[slug]).
 *
 * O slug resolve primeiro para um checkout publicado (criado no painel);
 * se não existir, cai para o slug do produto — mantendo os links antigos
 * a funcionar.
 */
export default async function CheckoutSlugPage(
  props: PageProps<"/checkout/[slug]">,
) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;

  const [checkout, shippingMethods] = await Promise.all([
    getPublishedCheckoutBySlug(slug),
    listActiveShippingMethods(),
  ]);

  const product = await getProductBySlug(checkout?.productSlug ?? slug);
  if (!product) notFound();

  const qtyRaw = Number(
    typeof searchParams.qty === "string" ? searchParams.qty : "1",
  );
  const quantity = Number.isFinite(qtyRaw)
    ? Math.min(10, Math.max(1, Math.trunc(qtyRaw)))
    : 1;

  const asString = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  // Variações reais do catálogo. O `?variant=` da URL é só uma sugestão: se
  // apontar para algo inválido ou esgotado, o checkout abre na padrão — e o
  // preço cobrado é sempre recalculado no servidor ao enviar o formulário.
  const variants = await listCheckoutVariants(product.id, product.priceCents);
  const requestedVariant = asString(searchParams.variant);
  const selectedVariant =
    variants.find(
      (item) => item.publicId === requestedVariant && item.purchasable,
    ) ?? pickDefaultVariant(variants);

  const unitPriceCents = selectedVariant?.priceCents ?? product.priceCents;

  const utm = {
    utmSource: asString(searchParams.utm_source),
    utmMedium: asString(searchParams.utm_medium),
    utmCampaign: asString(searchParams.utm_campaign),
    utmContent: asString(searchParams.utm_content),
    utmTerm: asString(searchParams.utm_term),
  };

  return (
    <div className="min-h-svh bg-zinc-50 text-zinc-900">
      <PixelScripts
        landingPageId={asString(searchParams.lp) || null}
        event="InitiateCheckout"
        content={{
          // Identificador de conteúdo com a variação: é o SKU que a campanha
          // precisa ver, não o produto genérico.
          id: selectedVariant?.sku ?? selectedVariant?.publicId ?? product.slug,
          name: selectedVariant
            ? `${product.name} — ${selectedVariant.label}`
            : product.name,
          valueCents: unitPriceCents * quantity,
          currency: product.currency,
        }}
      />
      <Tracker
        event="checkout_opened"
        productSlug={product.slug}
        valueCents={unitPriceCents * quantity}
        currency={product.currency}
      />
      {/* Cabeçalho — a logo (ou nome da loja) fica sempre centralizada. */}
      <header
        className="py-6 md:py-7"
        style={{ backgroundColor: DEFAULT_CHECKOUT_THEME.bannerColor }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4">
          <Link href={`/p/${product.slug}`} className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={STANDARD_STOREFRONT.logoUrl}
              alt={STANDARD_STOREFRONT.name}
              className="h-10 max-w-[220px] object-contain md:h-12"
            />
          </Link>
        </div>
      </header>

      <main>
        <CheckoutForm
          product={product}
          initialQuantity={quantity}
          shippingMethods={shippingMethods}
          theme={DEFAULT_CHECKOUT_THEME}
          utm={utm}
          storeName={STANDARD_STOREFRONT.name}
          landingPageId={asString(searchParams.lp)}
          variants={variants}
          initialVariantId={selectedVariant?.publicId ?? ""}
        />
      </main>

      <footer className="border-t bg-white py-5 text-center text-xs text-zinc-500">
        <p>
          © {new Date().getFullYear()} {STANDARD_STOREFRONT.name} · Pagamento
          seguro por MB WAY e Multibanco
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/legal/termos" className="hover:text-zinc-800">
            Termos
          </Link>
          <Link href="/legal/privacidade" className="hover:text-zinc-800">
            Privacidade
          </Link>
          <Link href="/legal/devolucoes" className="hover:text-zinc-800">
            Devoluções
          </Link>
        </p>
      </footer>

      <CookieBanner />
    </div>
  );
}
