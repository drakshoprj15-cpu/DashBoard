"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";

import {
  updateProductLandingAction,
  type ProductActionResult,
} from "@/features/products/actions";
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

const GALLERY_SLOTS = 5;

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

/** Garante um array com exatamente `GALLERY_SLOTS` posições (preenche com ""). */
function toGallerySlots(value: unknown): string[] {
  const urls = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
  const slots = urls.slice(0, GALLERY_SLOTS);
  while (slots.length < GALLERY_SLOTS) slots.push("");
  return slots;
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

  const [gallery, setGallery] = React.useState<string[]>(() =>
    toGallerySlots(content.gallery),
  );
  const galleryValue = gallery.filter(Boolean).join("\n");

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
            <Label>
              Imagens do produto{" "}
              <span className="text-muted-foreground font-normal">
                (até 5 fotos — a primeira é a imagem principal exibida na
                landing page)
              </span>
            </Label>
            <input type="hidden" name="gallery" value={galleryValue} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {gallery.map((url, i) => (
                <ImageDropzone
                  key={i}
                  id={`gallery-image-${i}`}
                  label={i === 0 ? "Imagem 1 (principal)" : `Imagem ${i + 1}`}
                  endpoint="/api/uploads/product-image"
                  hint="PNG, JPEG, WebP ou SVG · até 5 MB"
                  value={url}
                  onChange={(newUrl) =>
                    setGallery((prev) =>
                      prev.map((u, idx) => (idx === i ? newUrl : u)),
                    )
                  }
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Descrição{" "}
              <span className="text-muted-foreground font-normal">
                (parágrafos separados por linha em branco — fique à vontade
                para escrever bastante, é o texto principal da página)
              </span>
            </Label>
            <textarea
              id="description"
              name="description"
              rows={16}
              defaultValue={joinParagraphs(content.description)}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippingReturns">
              Envios &amp; Devoluções{" "}
              <span className="text-muted-foreground font-normal">
                (parágrafos separados por linha em branco — opcional, deixe
                vazio para usar o texto padrão)
              </span>
            </Label>
            <textarea
              id="shippingReturns"
              name="shippingReturns"
              rows={4}
              defaultValue={joinParagraphs(content.shippingReturns)}
              placeholder={
                "Envio: entregamos em 2 a 4 dias úteis...\n\nDevoluções: tem 14 dias para devolver o artigo..."
              }
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
