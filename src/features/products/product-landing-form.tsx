"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";

import {
  updateProductLandingAction,
  type ProductActionResult,
} from "@/features/products/actions";
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

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function joinLines(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string").join("\n")
    : "";
}

function joinParagraphs(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string").join("\n\n")
    : "";
}

function joinSpecs(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter(
      (pair): pair is [string, string] =>
        Array.isArray(pair) && pair.length === 2,
    )
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function ProductLandingForm({
  productId,
  landingContent,
}: {
  productId: string;
  landingContent: Record<string, unknown> | null;
}) {
  const [state, formAction, pending] = useActionState<
    ProductActionResult | null,
    FormData
  >(updateProductLandingAction, null);

  const content = landingContent ?? {};
  const compareAtPriceCents = num(content.compareAtPriceCents);
  const freeShippingFromCents = num(content.freeShippingFromCents);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Landing page</CardTitle>
        <CardDescription>
          Fotos, descrição e destaques exibidos em /p/[slug]. Preencha só com
          informações reais — evite descrições ou estoque inventados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={productId} />

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
              <Label htmlFor="brand">
                Marca{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input id="brand" name="brand" defaultValue={str(content.brand)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compareAtPrice">
                Preço &quot;de&quot;{" "}
                <span className="text-muted-foreground font-normal">
                  (riscado, opcional)
                </span>
              </Label>
              <Input
                id="compareAtPrice"
                name="compareAtPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={
                  compareAtPriceCents !== undefined
                    ? (compareAtPriceCents / 100).toFixed(2)
                    : ""
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="freeShippingFrom">
                Frete grátis a partir de{" "}
                <span className="text-muted-foreground font-normal">
                  (0 = desativado)
                </span>
              </Label>
              <Input
                id="freeShippingFrom"
                name="freeShippingFrom"
                type="number"
                step="0.01"
                min="0"
                defaultValue={
                  freeShippingFromCents !== undefined
                    ? (freeShippingFromCents / 100).toFixed(2)
                    : "0"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliveryEstimate">Prazo de entrega</Label>
              <Input
                id="deliveryEstimate"
                name="deliveryEstimate"
                defaultValue={str(content.deliveryEstimate) || "2–4 dias úteis"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="returnDays">Dias para devolução</Label>
              <Input
                id="returnDays"
                name="returnDays"
                type="number"
                min="0"
                step="1"
                defaultValue={num(content.returnDays) ?? 14}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery">
              Galeria de fotos{" "}
              <span className="text-muted-foreground font-normal">
                (uma URL por linha)
              </span>
            </Label>
            <textarea
              id="gallery"
              name="gallery"
              rows={4}
              defaultValue={joinLines(content.gallery)}
              placeholder={"https://…/foto1.jpg\nhttps://…/foto2.jpg"}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Descrição{" "}
              <span className="text-muted-foreground font-normal">
                (parágrafos separados por linha em branco)
              </span>
            </Label>
            <textarea
              id="description"
              name="description"
              rows={6}
              defaultValue={joinParagraphs(content.description)}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="highlights">
              Destaques{" "}
              <span className="text-muted-foreground font-normal">
                (um por linha)
              </span>
            </Label>
            <textarea
              id="highlights"
              name="highlights"
              rows={4}
              defaultValue={joinLines(content.highlights)}
              placeholder={"Peso máximo: 130 kg\nReclinação até 180°"}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="specs">
              Especificações{" "}
              <span className="text-muted-foreground font-normal">
                (uma por linha, no formato &quot;Chave: Valor&quot;)
              </span>
            </Label>
            <textarea
              id="specs"
              name="specs"
              rows={4}
              defaultValue={joinSpecs(content.specs)}
              placeholder={"Marca: ALPHA GAMER\nCor: Cinzento"}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>

          <Button type="submit" loading={pending}>
            <Save /> Salvar landing page
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
