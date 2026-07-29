import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getProductById } from "@/features/products/queries";
import { ProductCoreForm } from "@/features/products/product-core-form";
import { ProductLandingForm } from "@/features/products/product-landing-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Editar produto" };
export const dynamic = "force-dynamic";

export default async function ProdutoEditPage(
  props: PageProps<"/catalogo/produtos/[id]">,
) {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para gerir os produtos."
        className="min-h-[420px]"
      />
    );
  }

  const { id } = await props.params;
  const product = await getProductById(id);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button size="sm" variant="ghost" asChild className="-ml-2 mb-2">
          <Link href="/catalogo/produtos">
            <ArrowLeft /> Produtos
          </Link>
        </Button>
        <h2 className="text-xl font-bold tracking-tight">{product.name}</h2>
        <p className="text-muted-foreground text-sm">
          Edite os dados do produto e a landing page pública.
        </p>
      </div>

      <ProductCoreForm product={product} />
      <ProductLandingForm
        productId={product.id}
        landingContent={product.landingContent}
      />
    </div>
  );
}
