import type { Metadata } from "next";
import Link from "next/link";
import {
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  Package,
  Pencil,
  Trash2,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listProducts } from "@/features/products/queries";
import {
  archiveProductAction,
  toggleProductStatusAction,
} from "@/features/products/actions";
import { ProductCreateForm } from "@/features/products/product-create-form";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Catálogo · Produtos" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted"> = {
  active: "success",
  draft: "warning",
  archived: "muted",
};

const TYPE_LABEL: Record<string, string> = {
  digital: "Digital",
  physical: "Físico",
  service: "Serviço",
  subscription: "Assinatura",
};

export default async function ProdutosPage() {
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

  const rows = await listProducts();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Produtos</h2>
        <p className="text-muted-foreground text-sm">
          {rows.length} {rows.length === 1 ? "produto" : "produtos"} · edite um
          produto para personalizar a landing page
        </p>
      </div>

      <ProductCreateForm />

      {rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto criado"
          description="Crie um produto acima para vender no checkout e ter uma landing page própria."
          className="min-h-[240px]"
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2.5 font-medium">Produto</th>
                  <th className="pb-2.5 font-medium">Tipo</th>
                  <th className="pb-2.5 text-right font-medium">Preço</th>
                  <th className="pb-2.5 text-right font-medium">Pedidos</th>
                  <th className="pb-2.5 text-right font-medium">Receita</th>
                  <th className="pb-2.5 font-medium">Estado</th>
                  <th className="pb-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-3">
                      <p className="font-medium">{p.name}</p>
                      <code className="text-muted-foreground font-mono text-[11px]">
                        /p/{p.slug}
                      </code>
                    </td>
                    <td className="py-3">
                      {TYPE_LABEL[p.type] ?? p.type}
                      {p.variants ? (
                        <span className="mt-1 flex items-center gap-1.5">
                          <Badge variant="muted">
                            {p.variants.variantCount} variaç
                            {p.variants.variantCount === 1 ? "ão" : "ões"}
                          </Badge>
                          {p.variants.colors
                            .filter((color) => color.hexColor)
                            .slice(0, 5)
                            .map((color, index) => (
                              <span
                                key={`${color.label}-${index}`}
                                title={color.label}
                                aria-label={color.label}
                                className="size-3 rounded-full border"
                                style={{
                                  backgroundColor: color.hexColor ?? undefined,
                                }}
                              />
                            ))}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 text-right">
                      {p.variants &&
                      p.variants.minPriceCents !== null &&
                      p.variants.maxPriceCents !== null &&
                      p.variants.minPriceCents !== p.variants.maxPriceCents ? (
                        <span>
                          {formatMoney(
                            p.variants.minPriceCents,
                            p.currency,
                            "pt-PT",
                          )}
                          {" – "}
                          {formatMoney(
                            p.variants.maxPriceCents,
                            p.currency,
                            "pt-PT",
                          )}
                        </span>
                      ) : (
                        formatMoney(p.priceCents, p.currency, "pt-PT")
                      )}
                      {p.variants ? (
                        <span className="text-muted-foreground block text-[11px]">
                          {p.variants.totalStock} em estoque
                          {p.variants.soldOutCount > 0
                            ? ` · ${p.variants.soldOutCount} esgotada(s)`
                            : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 text-right">{p.orderCount}</td>
                    <td className="py-3 text-right font-medium">
                      {formatMoney(p.revenueCents, p.currency, "pt-PT")}
                    </td>
                    <td className="py-3">
                      <Badge variant={STATUS_VARIANT[p.status] ?? "muted"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            href={`/catalogo/produtos/${p.id}`}
                            aria-label="Editar produto e landing page"
                          >
                            <Pencil /> Editar
                          </Link>
                        </Button>
                        {p.status === "active" && (
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              href={`/p/${p.slug}`}
                              target="_blank"
                              aria-label="Abrir landing page"
                            >
                              <ExternalLink />
                            </Link>
                          </Button>
                        )}
                        <form action={toggleProductStatusAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            type="hidden"
                            name="activate"
                            value={String(p.status !== "active")}
                          />
                          <Button size="sm" variant="outline" type="submit">
                            {p.status === "active" ? <EyeOff /> : <Eye />}
                            {p.status === "active" ? "Despublicar" : "Publicar"}
                          </Button>
                        </form>
                        {p.status !== "archived" && (
                          <form action={archiveProductAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <Button
                              size="sm"
                              variant="ghost"
                              type="submit"
                              aria-label="Arquivar"
                            >
                              <Trash2 />
                            </Button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
