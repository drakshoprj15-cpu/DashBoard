"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";

import {
  createProductAction,
  type ProductActionResult,
} from "@/features/products/actions";
import { slugify } from "@/validations/product-crud";
import { ImageDropzone } from "@/components/image-dropzone";
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

export function ProductCreateForm() {
  const [state, formAction, pending] = useActionState<
    ProductActionResult | null,
    FormData
  >(createProductAction, null);

  const [slugPreview, setSlugPreview] = React.useState("");
  const [trackInventory, setTrackInventory] = React.useState(false);
  const [mainImageUrl, setMainImageUrl] = React.useState("");
  const formKey = state?.ok ? `saved-${state.message ?? ""}` : "novo";

  // Limpa a imagem escolhida quando o produto é criado — sem isso ela
  // ficaria presa no formulário e seria reenviada sem querer no próximo
  // cadastro (o `key` do form já reseta os campos não controlados, mas não
  // este estado, que vive no componente pai).
  const [handledState, setHandledState] = React.useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setMainImageUrl("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Criar produto</CardTitle>
        <CardDescription>
          Cadastre o produto primeiro; a landing page (fotos, descrição,
          destaques) é personalizada depois, na página do produto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={formKey} action={formAction} className="space-y-4">
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
                placeholder="Ex.: Cadeira Gaming ALPHA"
                required
                onChange={(e) => setSlugPreview(slugify(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <select
                id="type"
                name="type"
                defaultValue="digital"
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
              <Label htmlFor="slug">
                Endereço público{" "}
                <span className="text-muted-foreground font-normal">
                  (deixe vazio para gerar do nome)
                </span>
              </Label>
              <Input
                id="slug"
                name="slug"
                placeholder={slugPreview || "cadeira-gaming-alpha"}
                onChange={(e) => setSlugPreview(slugify(e.target.value))}
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
                placeholder="39.90"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Moeda</Label>
              <select
                id="currency"
                name="currency"
                defaultValue="EUR"
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
                placeholder="Uma frase que resuma o produto"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <input type="hidden" name="mainImageUrl" value={mainImageUrl} />
              <ImageDropzone
                id="mainImageUrl-dropzone"
                label="Imagem principal"
                endpoint="/api/uploads/product-image"
                hint="PNG, JPEG, WebP ou SVG · até 5 MB"
                value={mainImageUrl}
                onChange={setMainImageUrl}
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
                  defaultValue={0}
                />
              </div>
            )}
          </div>

          <Button type="submit" loading={pending}>
            <Plus /> Criar produto
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
