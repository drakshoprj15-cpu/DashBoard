import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Database, ExternalLink, Globe, ImageOff, Pencil } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listDomains } from "@/features/domains/queries";
import { listProducts } from "@/features/products/queries";
import { getAppUrl } from "@/lib/app-url";
import { formatMoney } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Landing pages" };
export const dynamic = "force-dynamic";

export default async function LandingPagesPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para gerir as landing pages."
        className="min-h-[420px]"
      />
    );
  }

  const [products, domains] = await Promise.all([listProducts(), listDomains()]);
  const appUrl = getAppUrl();

  // Produto com domínio próprio ativo é anunciado por esse endereço; os
  // demais continuam no domínio do painel, em /p/[slug].
  const domainByProduct = new Map(
    domains
      .filter((d) => d.isActive && d.productId)
      .map((d) => [d.productId as string, d.hostname]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Landing pages</h2>
          <p className="text-muted-foreground text-sm">
            Uma página por produto ativo · edite fotos e conteúdo em Catálogo →
            Produtos, e o endereço em Landing pages → Domínios
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/landing-pages/dominios">
            <Globe /> Domínios
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="Nenhum produto cadastrado"
          description="Crie um produto em Catálogo → Produtos para ele ganhar uma landing page própria."
          className="min-h-[240px]"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const hostname = domainByProduct.get(p.id);
            const publicUrl = hostname
              ? `https://${hostname}`
              : `${appUrl}/p/${p.slug}`;

            return (
            <Card key={p.id} className="gap-3 overflow-hidden py-0 pb-5">
              <div className="bg-muted relative aspect-[16/9] w-full overflow-hidden border-b">
                {p.mainImageUrl ? (
                  <Image
                    src={p.mainImageUrl}
                    alt={p.name}
                    fill
                    className="object-contain p-4"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
                    Sem imagem
                  </div>
                )}
              </div>
              <CardHeader className="px-5">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <CardDescription>
                  {formatMoney(p.priceCents, p.currency, "pt-PT")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 px-5">
                <Badge variant={p.status === "active" ? "success" : "warning"}>
                  {p.status === "active" ? "Publicada" : "Rascunho"}
                </Badge>
                {hostname ? (
                  <Badge variant="secondary">Domínio próprio</Badge>
                ) : null}
                <code className="bg-muted text-muted-foreground w-full truncate rounded px-1.5 py-0.5 font-mono text-[11px]">
                  {publicUrl}
                </code>
                <div className="mt-2 flex w-full gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/catalogo/produtos/${p.id}`}>
                      <Pencil /> Editar
                    </Link>
                  </Button>
                  {p.status === "active" && (
                    <Button size="sm" asChild>
                      <a href={publicUrl} target="_blank" rel="noreferrer">
                        <ExternalLink /> Abrir página
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
