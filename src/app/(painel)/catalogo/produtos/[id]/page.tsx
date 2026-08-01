import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Code2, Database, LayoutTemplate, Package } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getProductById } from "@/features/products/queries";
import { ProductCoreForm } from "@/features/products/product-core-form";
import { ProductLandingForm } from "@/features/products/product-landing-form";
import { getCustomCodeByProductId } from "@/features/custom-code/queries";
import { CodeTab } from "@/features/custom-code/code-tab";
import { getVerifiedDomainForProductSlug } from "@/features/domains/queries";
import { getAppUrl } from "@/lib/app-url";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const [customCode, hostname] = await Promise.all([
    getCustomCodeByProductId(product.id),
    getVerifiedDomainForProductSlug(product.slug),
  ]);
  const publicUrl = hostname
    ? `https://${hostname}`
    : `${getAppUrl()}/p/${product.slug}`;

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
          Edite os dados do produto, a landing page pública e o código dela.
        </p>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">
            <Package /> Dados
          </TabsTrigger>
          <TabsTrigger value="landing">
            <LayoutTemplate /> Landing page
          </TabsTrigger>
          <TabsTrigger value="codigo">
            <Code2 /> Código
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <ProductCoreForm product={product} />
        </TabsContent>

        <TabsContent value="landing" className="mt-4">
          <ProductLandingForm
            productId={product.id}
            landingContent={product.landingContent}
          />
        </TabsContent>

        <TabsContent value="codigo" className="mt-4">
          <CodeTab
            productId={product.id}
            productSlug={product.slug}
            publicUrl={publicUrl}
            isPublished={product.status === "active"}
            initial={{
              ...customCode,
              updatedAt: customCode.updatedAt
                ? customCode.updatedAt.toISOString()
                : null,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
