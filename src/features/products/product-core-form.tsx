"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";

import {
  updateProductCoreAction,
  type ProductActionResult,
} from "@/features/products/actions";
import { slugify } from "@/validations/product-crud";
import type { ProductDetail } from "@/features/products/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TYPES = [
  { value: "digital", label: "Digital" },
  { value: "physical", label: "Físico" },
  { value: "service", label: "Serviço" },
  { value: "subscription", label: "Assinatura" },
] as const;

export function ProductCoreForm({ product }: { product: ProductDetail }) {
  const [state, formAction, pending] = useActionState<
    ProductActionResult | null,
    FormData
  >(updateProductCoreAction, null);

  const [slugPreview, setSlugPreview] = React.useState(product.slug);
  const [trackInventory, setTrackInventory] = React.useState(
    product.trackInventory,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dados do produto</CardTitle>
        <CardDescription>Nome, preço, tipo e estoque.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={product.id} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && state.message && (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do produto</Label>
              <Input
                id="name"
                name="name"
                defaultValue={product.name}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <select
                id="type"
                name="type"
                defaultValue={product.type}
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="slug">Endereço público</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={product.slug}
                onChange={(e) => setSlugPreview(slugify(e.target.value))}
                required
              />
              <p className="text-muted-foreground font-mono text-xs break-all">
                /p/{slugPreview || "…"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Preço</Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={(product.priceCents / 100).toFixed(2)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Moeda</Label>
              <select
                id="currency"
                name="currency"
                defaultValue={product.currency}
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                <option value="EUR">EUR (€)</option>
                <option value="BRL">BRL (R$)</option>
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="shortDescription">
                Descrição curta{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="shortDescription"
                name="shortDescription"
                defaultValue={product.shortDescription ?? ""}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mainImageUrl">
                URL da imagem principal{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="mainImageUrl"
                name="mainImageUrl"
                type="url"
                defaultValue={product.mainImageUrl ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="trackInventory"
                checked={trackInventory}
                onChange={(e) => setTrackInventory(e.target.checked)}
                className="accent-primary size-4"
              />
              Controlar estoque
            </label>
            {trackInventory && (
              <div className="max-w-40 space-y-2">
                <Label htmlFor="stockQuantity">Quantidade em estoque</Label>
                <Input
                  id="stockQuantity"
                  name="stockQuantity"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={product.stockQuantity}
                />
              </div>
            )}
          </div>

          <Button type="submit" loading={pending}>
            <Save /> Salvar dados
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
