"use client";

import * as React from "react";
import { AlertCircle, ArrowDown, ArrowUp, Save, Trash2 } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageDropzone } from "@/components/image-dropzone";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  buildPriceView,
  isVariantStatus,
  VARIANT_STATUS_LABEL,
  VARIANT_STATUSES,
  type VariantStatus,
} from "./pricing";
import type { OptionRow, VariantRow } from "./types";

const selectClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

export interface VariantFormValues {
  id?: string;
  optionValueIds: Record<string, string>;
  name: string;
  publicName: string;
  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string;
  cost: string;
  stockQuantity: string;
  trackInventory: boolean;
  allowBackorder: boolean;
  purchaseLimit: string;
  status: VariantStatus;
  isDefault: boolean;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  mainImageUrl: string;
  thumbnailUrl: string;
  shareImageUrl: string;
  hexColor: string;
  gallery: string[];
}

/** Centavos → "39,90" para o campo de texto (nunca `toFixed` sobre float). */
function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** "39,90" → 3990, para a prévia de desconto enquanto se digita. */
function inputToCents(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export function emptyVariantForm(options: OptionRow[]): VariantFormValues {
  return {
    optionValueIds: Object.fromEntries(
      options.map((option) => [option.id, option.values[0]?.id ?? ""]),
    ),
    name: "",
    publicName: "",
    sku: "",
    barcode: "",
    price: "",
    compareAtPrice: "",
    cost: "",
    stockQuantity: "0",
    trackInventory: true,
    allowBackorder: false,
    purchaseLimit: "",
    status: "active",
    isDefault: false,
    weightGrams: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    mainImageUrl: "",
    thumbnailUrl: "",
    shareImageUrl: "",
    hexColor: "",
    gallery: [],
  };
}

export function toVariantForm(
  variant: VariantRow,
  options: OptionRow[],
): VariantFormValues {
  const optionValueIds: Record<string, string> = {};
  for (const option of options) {
    optionValueIds[option.id] =
      variant.optionValues.find((value) => value.optionId === option.id)
        ?.valueId ?? "";
  }

  return {
    id: variant.id,
    optionValueIds,
    name: variant.name,
    publicName: variant.publicName ?? "",
    sku: variant.sku ?? "",
    barcode: variant.barcode ?? "",
    price: centsToInput(variant.priceCents),
    compareAtPrice: centsToInput(variant.compareAtPriceCents),
    cost: centsToInput(variant.costCents),
    stockQuantity: String(variant.stockQuantity),
    trackInventory: variant.trackInventory,
    allowBackorder: variant.allowBackorder,
    purchaseLimit: variant.purchaseLimit ? String(variant.purchaseLimit) : "",
    status: variant.status,
    isDefault: variant.isDefault,
    weightGrams: variant.weightGrams ? String(variant.weightGrams) : "",
    lengthCm: variant.dimensions?.lengthCm
      ? String(variant.dimensions.lengthCm)
      : "",
    widthCm: variant.dimensions?.widthCm
      ? String(variant.dimensions.widthCm)
      : "",
    heightCm: variant.dimensions?.heightCm
      ? String(variant.dimensions.heightCm)
      : "",
    mainImageUrl: variant.mainImageUrl ?? "",
    thumbnailUrl: variant.thumbnailUrl ?? "",
    shareImageUrl: variant.shareImageUrl ?? "",
    hexColor: variant.hexColor ?? "",
    gallery: variant.media.map((item) => item.url),
  };
}

function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function VariantEditorSheet({
  open,
  onOpenChange,
  options,
  currency,
  values,
  onValuesChange,
  onSubmit,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: OptionRow[];
  currency: string;
  values: VariantFormValues;
  onValuesChange: (values: VariantFormValues) => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string;
}) {
  const priceCents = inputToCents(values.price);
  const compareCents = inputToCents(values.compareAtPrice);
  const preview =
    priceCents !== null ? buildPriceView(priceCents, compareCents) : null;

  function patch(next: Partial<VariantFormValues>) {
    onValuesChange({ ...values, ...next });
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= values.gallery.length) return;
    const gallery = [...values.gallery];
    [gallery[index], gallery[target]] = [gallery[target], gallery[index]];
    patch({ gallery });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {values.id ? "Editar variação" : "Nova variação"}
          </SheetTitle>
          <SheetDescription>
            Preço, estoque e fotos próprios desta opção. É isto que o cliente vê
            ao escolher e o que o checkout revalida antes de cobrar.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-4">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {options.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Combinação</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {options.map((option) => (
                  <Field
                    key={option.id}
                    label={option.name}
                    htmlFor={`variant-option-${option.id}`}
                  >
                    <select
                      id={`variant-option-${option.id}`}
                      className={selectClass}
                      value={values.optionValueIds[option.id] ?? ""}
                      onChange={(event) =>
                        patch({
                          optionValueIds: {
                            ...values.optionValueIds,
                            [option.id]: event.target.value,
                          },
                        })
                      }
                    >
                      <option value="">— Não usar —</option>
                      {option.values.map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.label ?? value.value}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Identificação</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Nome da variação"
                htmlFor="variant-name"
                hint="Vazio = montado a partir da combinação (ex.: Preto · M)"
              >
                <Input
                  id="variant-name"
                  value={values.name}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </Field>
              <Field label="Nome público" htmlFor="variant-public-name">
                <Input
                  id="variant-public-name"
                  value={values.publicName}
                  onChange={(event) =>
                    patch({ publicName: event.target.value })
                  }
                />
              </Field>
              <Field label="SKU" htmlFor="variant-sku">
                <Input
                  id="variant-sku"
                  value={values.sku}
                  onChange={(event) => patch({ sku: event.target.value })}
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Código de barras" htmlFor="variant-barcode">
                <Input
                  id="variant-barcode"
                  value={values.barcode}
                  onChange={(event) => patch({ barcode: event.target.value })}
                  className="font-mono text-xs"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Preço</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Preço de venda" htmlFor="variant-price">
                <Input
                  id="variant-price"
                  inputMode="decimal"
                  value={values.price}
                  placeholder="39,90"
                  onChange={(event) => patch({ price: event.target.value })}
                />
              </Field>
              <Field label="Preço anterior" htmlFor="variant-compare">
                <Input
                  id="variant-compare"
                  inputMode="decimal"
                  value={values.compareAtPrice}
                  placeholder="229,90"
                  onChange={(event) =>
                    patch({ compareAtPrice: event.target.value })
                  }
                />
              </Field>
              <Field label="Custo" htmlFor="variant-cost">
                <Input
                  id="variant-cost"
                  inputMode="decimal"
                  value={values.cost}
                  onChange={(event) => patch({ cost: event.target.value })}
                />
              </Field>
            </div>

            {preview ? (
              <div className="bg-muted/40 flex flex-wrap items-baseline gap-3 rounded-lg border p-3">
                <span className="text-xl font-bold">
                  {formatMoney(preview.priceCents, currency, "pt-PT")}
                </span>
                {preview.showCompareAt ? (
                  <span className="text-muted-foreground line-through">
                    {formatMoney(
                      preview.compareAtPriceCents as number,
                      currency,
                      "pt-PT",
                    )}
                  </span>
                ) : null}
                {preview.discountPercent ? (
                  <Badge variant="success">-{preview.discountPercent}%</Badge>
                ) : null}
                {preview.savingsCents > 0 ? (
                  <span className="text-success text-sm font-medium">
                    Economia de{" "}
                    {formatMoney(preview.savingsCents, currency, "pt-PT")}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Sem preço anterior maior: a página não mostra desconto nem
                    valor riscado.
                  </span>
                )}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Estoque e disponibilidade</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Estoque" htmlFor="variant-stock">
                <Input
                  id="variant-stock"
                  type="number"
                  min={0}
                  value={values.stockQuantity}
                  onChange={(event) =>
                    patch({ stockQuantity: event.target.value })
                  }
                />
              </Field>
              <Field
                label="Limite por pedido"
                htmlFor="variant-limit"
                hint="Vazio = limite do checkout"
              >
                <Input
                  id="variant-limit"
                  type="number"
                  min={1}
                  value={values.purchaseLimit}
                  onChange={(event) =>
                    patch({ purchaseLimit: event.target.value })
                  }
                />
              </Field>
              <Field label="Estado" htmlFor="variant-status">
                <select
                  id="variant-status"
                  className={selectClass}
                  value={values.status}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (isVariantStatus(next)) patch({ status: next });
                  }}
                >
                  {VARIANT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {VARIANT_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="variant-track">Controlar estoque</Label>
                <p className="text-muted-foreground text-xs">
                  Desligado, a variação vende sem contagem — a página não mostra
                  quantidade nenhuma.
                </p>
              </div>
              <Switch
                id="variant-track"
                checked={values.trackInventory}
                onCheckedChange={(checked) =>
                  patch({ trackInventory: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="variant-backorder">Vender sem estoque</Label>
                <p className="text-muted-foreground text-xs">
                  Aceita pedidos com estoque zerado. Use só quando a reposição
                  estiver garantida.
                </p>
              </div>
              <Switch
                id="variant-backorder"
                checked={values.allowBackorder}
                onCheckedChange={(checked) =>
                  patch({ allowBackorder: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="variant-default">Variação padrão</Label>
                <p className="text-muted-foreground text-xs">
                  A que abre selecionada na landing page.
                </p>
              </div>
              <Switch
                id="variant-default"
                checked={values.isDefault}
                onCheckedChange={(checked) => patch({ isDefault: checked })}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Imagens</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <ImageDropzone
                id="variant-main-image"
                label="Imagem principal"
                endpoint="/api/uploads/product-image"
                optional={false}
                value={values.mainImageUrl}
                onChange={(url) => patch({ mainImageUrl: url })}
              />
              <ImageDropzone
                id="variant-thumb"
                label="Miniatura do seletor"
                endpoint="/api/uploads/product-image"
                value={values.thumbnailUrl}
                onChange={(url) => patch({ thumbnailUrl: url })}
              />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Galeria desta variação</Label>
                <Badge variant="muted">{values.gallery.length} foto(s)</Badge>
              </div>
              {values.gallery.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Sem fotos próprias, a página usa a galeria geral do produto.
                </p>
              ) : (
                <ul className="space-y-2">
                  {values.gallery.map((url, index) => (
                    <li
                      key={`${url}-${index}`}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="size-10 rounded object-contain"
                      />
                      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
                        {url}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Mover imagem ${index + 1} para cima`}
                        disabled={index === 0}
                        onClick={() => moveImage(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Mover imagem ${index + 1} para baixo`}
                        disabled={index === values.gallery.length - 1}
                        onClick={() => moveImage(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remover imagem ${index + 1}`}
                        onClick={() =>
                          patch({
                            gallery: values.gallery.filter(
                              (_, position) => position !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <GalleryUploader
                onAdd={(url) => patch({ gallery: [...values.gallery, url] })}
              />
              <p className="text-muted-foreground text-xs">
                A primeira imagem é a principal da galeria. Envie fotos reais
                desta cor — a página nunca tinge a foto padrão.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Envio</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Peso (g)" htmlFor="variant-weight">
                <Input
                  id="variant-weight"
                  type="number"
                  min={0}
                  value={values.weightGrams}
                  onChange={(event) =>
                    patch({ weightGrams: event.target.value })
                  }
                />
              </Field>
              <Field label="Comprimento (cm)" htmlFor="variant-length">
                <Input
                  id="variant-length"
                  type="number"
                  min={0}
                  value={values.lengthCm}
                  onChange={(event) => patch({ lengthCm: event.target.value })}
                />
              </Field>
              <Field label="Largura (cm)" htmlFor="variant-width">
                <Input
                  id="variant-width"
                  type="number"
                  min={0}
                  value={values.widthCm}
                  onChange={(event) => patch({ widthCm: event.target.value })}
                />
              </Field>
              <Field label="Altura (cm)" htmlFor="variant-height">
                <Input
                  id="variant-height"
                  type="number"
                  min={0}
                  value={values.heightCm}
                  onChange={(event) => patch({ heightCm: event.target.value })}
                />
              </Field>
            </div>
          </section>
        </div>

        <SheetFooter>
          <Button type="button" onClick={onSubmit} loading={pending}>
            <Save /> Salvar variação
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Dropzone de somar fotos: o campo fica sempre vazio e cada envio bem
 * sucedido empurra a URL para a lista, em vez de substituir a anterior.
 */
function GalleryUploader({ onAdd }: { onAdd: (url: string) => void }) {
  return (
    <ImageDropzone
      id="variant-gallery-upload"
      label="Adicionar foto à galeria"
      endpoint="/api/uploads/product-image"
      hint="PNG, JPEG ou WebP · até 5 MB"
      value=""
      onChange={(url) => {
        if (url) onAdd(url);
      }}
    />
  );
}
