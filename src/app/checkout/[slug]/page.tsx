import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { techNebulaStore } from "@/features/landing/technebula-data";
import { getProductBySlug } from "@/features/landing/queries";
import { CheckoutForm } from "@/features/checkout/checkout-form";
import { PixelScripts } from "@/features/pixels/pixel-scripts";
import { Tracker } from "@/features/analytics/tracker";

export const metadata: Metadata = {
  title: `Checkout · ${techNebulaStore.name}`,
};

/**
 * Checkout público (/checkout/[slug]) no layout TechNébula.
 * Produtos são resolvidos pelo slug a partir do banco (tabela `products`).
 */
export default async function CheckoutSlugPage(
  props: PageProps<"/checkout/[slug]">,
) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const qtyRaw = Number(
    typeof searchParams.qty === "string" ? searchParams.qty : "1",
  );
  const quantity = Number.isFinite(qtyRaw)
    ? Math.min(10, Math.max(1, Math.trunc(qtyRaw)))
    : 1;

  return (
    <div className="min-h-svh bg-zinc-50 text-zinc-900">
      <PixelScripts
        event="InitiateCheckout"
        content={{
          id: product.slug,
          name: product.name,
          valueCents: product.priceCents * quantity,
          currency: product.currency,
        }}
      />
      <Tracker
        event="checkout_opened"
        productSlug={product.slug}
        valueCents={product.priceCents * quantity}
        currency={product.currency}
      />
      {/* Cabeçalho */}
      <header className="bg-zinc-950 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <Link
            href={`/p/${product.slug}`}
            className="text-xl font-black tracking-tight text-white"
          >
            Tech<span className="text-violet-400">Nébula</span>
          </Link>
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Lock className="size-3.5" /> Checkout seguro
          </span>
        </div>
      </header>

      <main>
        <CheckoutForm product={product} initialQuantity={quantity} />
      </main>

      <footer className="border-t bg-white py-5 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} {techNebulaStore.name} · Pagamento seguro
        por MB WAY e Multibanco
      </footer>
    </div>
  );
}
