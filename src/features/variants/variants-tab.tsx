"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Copy,
  Eye,
  Grid3x3,
  Layers,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  bulkVariantAction,
  deleteVariantAction,
  duplicateVariantAction,
  generateVariantMatrixAction,
  saveProductOptionsAction,
  saveVariantAction,
  setDefaultVariantAction,
  type VariantActionResult,
} from "./actions";
import {
  buildPriceView,
  effectivePriceCents,
  isPurchasable,
  VARIANT_STATUS_LABEL,
} from "./pricing";
import {
  OptionsEditor,
  emptyOption,
  toDraftOptions,
  type DraftOption,
} from "./options-editor";
import {
  VariantEditorSheet,
  emptyVariantForm,
  toVariantForm,
  type VariantFormValues,
} from "./variant-editor-sheet";
import { VariantPreview } from "./variant-preview";
import type { ProductVariantsData, VariantRow } from "./types";

const selectClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

const BULK_ACTIONS = [
  { value: "set_price", label: "Definir preço" },
  { value: "set_compare_at_price", label: "Definir preço anterior" },
  { value: "set_stock", label: "Definir estoque" },
  { value: "activate", label: "Ativar" },
  { value: "deactivate", label: "Desativar" },
  { value: "generate_sku", label: "Gerar SKU" },
  { value: "delete", label: "Excluir" },
] as const;

type BulkActionKind = (typeof BULK_ACTIONS)[number]["value"];

function isBulkAction(value: string): value is BulkActionKind {
  return BULK_ACTIONS.some((action) => action.value === value);
}

/** "39,90" → 3990 no formato que a action espera (string ou vazio). */
function moneyField(value: string): string {
  return value.trim();
}

function statusVariant(variant: VariantRow): "success" | "warning" | "muted" {
  if (variant.archivedAt) return "muted";
  if (!isPurchasable(variant)) return "warning";
  return "success";
}

export function VariantsTab({ data }: { data: ProductVariantsData }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [hasVariants, setHasVariants] = React.useState(data.hasVariants);
  const [options, setOptions] = React.useState<DraftOption[]>(() =>
    data.options.length > 0
      ? toDraftOptions(data.options)
      : [emptyOption("Cor")],
  );
  const [optionsError, setOptionsError] = React.useState("");

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorValues, setEditorValues] = React.useState<VariantFormValues>(
    () => emptyVariantForm(data.options),
  );
  const [editorError, setEditorError] = React.useState("");

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkAction, setBulkAction] =
    React.useState<BulkActionKind>("set_price");
  const [bulkValue, setBulkValue] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<VariantRow | null>(
    null,
  );

  const currency = data.productCurrency;
  const activeVariants = data.variants.filter((variant) => !variant.archivedAt);
  const archivedVariants = data.variants.filter(
    (variant) => variant.archivedAt,
  );

  /** Executa uma action, mostra o resultado e recarrega os dados do servidor. */
  function run(
    action: () => Promise<VariantActionResult>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "Feito.");
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível concluir a ação.");
      }
    });
  }

  function saveOptions() {
    setOptionsError("");
    run(async () => {
      const result = await saveProductOptionsAction({
        productId: data.productId,
        hasVariants,
        options: hasVariants
          ? options
              .filter((option) => option.name.trim() !== "")
              .map((option) => ({
                id: option.id,
                name: option.name,
                values: option.values
                  .filter((value) => value.value.trim() !== "")
                  .map((value) => ({
                    id: value.id,
                    value: value.value,
                    label: value.label || null,
                    hexColor: value.hexColor || null,
                    thumbnailUrl: value.thumbnailUrl || null,
                  })),
              }))
          : [],
      });
      if (!result.ok) setOptionsError(result.error ?? "");
      return result;
    });
  }

  function openNewVariant() {
    setEditorError("");
    setEditorValues(emptyVariantForm(data.options));
    setEditorOpen(true);
  }

  function openEditVariant(variant: VariantRow) {
    setEditorError("");
    setEditorValues(toVariantForm(variant, data.options));
    setEditorOpen(true);
  }

  function submitVariant() {
    setEditorError("");
    run(
      async () => {
        const result = await saveVariantAction({
          productId: data.productId,
          variant: {
            id: editorValues.id,
            optionValueIds: Object.fromEntries(
              Object.entries(editorValues.optionValueIds).filter(
                ([, valueId]) => valueId !== "",
              ),
            ),
            name: editorValues.name || null,
            publicName: editorValues.publicName || null,
            sku: editorValues.sku || null,
            barcode: editorValues.barcode || null,
            priceCents: moneyField(editorValues.price),
            compareAtPriceCents: moneyField(editorValues.compareAtPrice),
            costCents: moneyField(editorValues.cost),
            stockQuantity: editorValues.stockQuantity,
            trackInventory: editorValues.trackInventory,
            allowBackorder: editorValues.allowBackorder,
            purchaseLimit: editorValues.purchaseLimit,
            status: editorValues.status,
            isDefault: editorValues.isDefault,
            position: null,
            weightGrams: editorValues.weightGrams,
            lengthCm: editorValues.lengthCm,
            widthCm: editorValues.widthCm,
            heightCm: editorValues.heightCm,
            mainImageUrl: editorValues.mainImageUrl || null,
            thumbnailUrl: editorValues.thumbnailUrl || null,
            shareImageUrl: editorValues.shareImageUrl || null,
            hexColor: editorValues.hexColor || null,
            gallery: editorValues.gallery,
          },
        });
        if (!result.ok) setEditorError(result.error ?? "");
        return result;
      },
      () => setEditorOpen(false),
    );
  }

  function applyBulk() {
    run(
      () =>
        bulkVariantAction({
          productId: data.productId,
          variantIds: selectedIds,
          action: bulkAction,
          priceCents: bulkValue,
          stockQuantity: bulkValue,
        }),
      () => setSelectedIds([]),
    );
  }

  const allSelected =
    activeVariants.length > 0 && selectedIds.length === activeVariants.length;

  return (
    <div className="space-y-6">
      {/* 1. Ligar/desligar e definir os atributos ---------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variações</CardTitle>
          <CardDescription>
            Cor, tamanho, modelo ou voltagem — cada opção com preço, estoque e
            fotos próprios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label htmlFor="has-variants">
                Este produto possui variações
              </Label>
              <p className="text-muted-foreground text-xs">
                Ligado, o preço e o estoque que valem na página e no checkout
                são os da variação escolhida pelo cliente.
              </p>
            </div>
            <Switch
              id="has-variants"
              checked={hasVariants}
              onCheckedChange={setHasVariants}
            />
          </div>

          {optionsError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{optionsError}</AlertDescription>
            </Alert>
          ) : null}

          {hasVariants ? (
            <OptionsEditor
              options={options}
              onChange={setOptions}
              disabled={pending}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveOptions} loading={pending}>
              <Save /> Salvar opções
            </Button>
            {hasVariants ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending || data.options.length === 0}
                onClick={() =>
                  run(() =>
                    generateVariantMatrixAction({ productId: data.productId }),
                  )
                }
              >
                <Grid3x3 /> Gerar combinações
              </Button>
            ) : null}
          </div>
          {hasVariants && data.options.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Salve as opções primeiro — a matriz é gerada a partir delas.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* 2. Tabela de variações --------------------------------------------- */}
      {hasVariants ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Variações cadastradas ({activeVariants.length})
              </CardTitle>
              <CardDescription>
                Preço, estoque, SKU e estado de cada opção.
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={openNewVariant}>
              <Plus /> Nova variação
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedIds.length > 0 ? (
              <div className="bg-muted/40 flex flex-wrap items-end gap-3 rounded-lg border p-3">
                <Badge variant="muted">
                  {selectedIds.length} selecionada(s)
                </Badge>
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-action" className="text-xs">
                    Ação em massa
                  </Label>
                  <select
                    id="bulk-action"
                    className={selectClass}
                    value={bulkAction}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (isBulkAction(next)) setBulkAction(next);
                    }}
                  >
                    {BULK_ACTIONS.map((action) => (
                      <option key={action.value} value={action.value}>
                        {action.label}
                      </option>
                    ))}
                  </select>
                </div>
                {["set_price", "set_compare_at_price", "set_stock"].includes(
                  bulkAction,
                ) ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk-value" className="text-xs">
                      {bulkAction === "set_stock" ? "Quantidade" : "Valor"}
                    </Label>
                    <Input
                      id="bulk-value"
                      value={bulkValue}
                      inputMode="decimal"
                      onChange={(event) => setBulkValue(event.target.value)}
                      className="w-32"
                    />
                  </div>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={bulkAction === "delete" ? "destructive" : "default"}
                  loading={pending}
                  onClick={applyBulk}
                >
                  Aplicar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedIds([])}
                >
                  Limpar seleção
                </Button>
              </div>
            ) : null}

            {activeVariants.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhuma variação ainda. Gere as combinações a partir das opções
                ou crie uma manualmente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="pb-2.5 font-medium">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas as variações"
                          checked={allSelected}
                          onChange={(event) =>
                            setSelectedIds(
                              event.target.checked
                                ? activeVariants.map((variant) => variant.id)
                                : [],
                            )
                          }
                          className="accent-primary size-4"
                        />
                      </th>
                      <th className="pb-2.5 font-medium">Variação</th>
                      <th className="pb-2.5 font-medium">SKU</th>
                      <th className="pb-2.5 text-right font-medium">Preço</th>
                      <th className="pb-2.5 text-right font-medium">
                        Anterior
                      </th>
                      <th className="pb-2.5 text-right font-medium">Estoque</th>
                      <th className="pb-2.5 font-medium">Estado</th>
                      <th className="pb-2.5 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeVariants.map((variant) => {
                      const price = buildPriceView(
                        effectivePriceCents(
                          variant.priceCents,
                          data.productPriceCents,
                        ),
                        variant.compareAtPriceCents,
                      );

                      return (
                        <tr key={variant.id} className="border-b last:border-0">
                          <td className="py-3">
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${variant.name}`}
                              checked={selectedIds.includes(variant.id)}
                              onChange={(event) =>
                                setSelectedIds((current) =>
                                  event.target.checked
                                    ? [...current, variant.id]
                                    : current.filter((id) => id !== variant.id),
                                )
                              }
                              className="accent-primary size-4"
                            />
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {variant.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={variant.thumbnailUrl}
                                  alt=""
                                  className="size-8 rounded border object-cover"
                                />
                              ) : variant.hexColor ? (
                                <span
                                  className="size-5 rounded-full border"
                                  style={{ backgroundColor: variant.hexColor }}
                                  aria-hidden
                                />
                              ) : null}
                              <span>
                                <span className="flex items-center gap-1.5 font-medium">
                                  {variant.publicName ?? variant.name}
                                  {variant.isDefault ? (
                                    <Badge variant="info">Padrão</Badge>
                                  ) : null}
                                </span>
                                <span className="text-muted-foreground block text-[11px]">
                                  {variant.media.length > 0
                                    ? `${variant.media.length} foto(s)`
                                    : "sem galeria própria"}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td className="text-muted-foreground py-3 font-mono text-[11px]">
                            {variant.sku ?? "—"}
                          </td>
                          <td className="py-3 text-right font-medium">
                            {formatMoney(price.priceCents, currency, "pt-PT")}
                          </td>
                          <td className="text-muted-foreground py-3 text-right">
                            {price.showCompareAt ? (
                              <span>
                                <span className="line-through">
                                  {formatMoney(
                                    price.compareAtPriceCents as number,
                                    currency,
                                    "pt-PT",
                                  )}
                                </span>{" "}
                                <span className="text-success font-semibold">
                                  -{price.discountPercent}%
                                </span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td
                            className={cn(
                              "py-3 text-right",
                              variant.trackInventory &&
                                variant.stockQuantity <= 0 &&
                                "text-destructive font-semibold",
                            )}
                          >
                            {variant.trackInventory
                              ? variant.stockQuantity
                              : "—"}
                          </td>
                          <td className="py-3">
                            <Badge variant={statusVariant(variant)}>
                              {variant.trackInventory &&
                              variant.stockQuantity <= 0 &&
                              !variant.allowBackorder &&
                              variant.status === "active"
                                ? "Esgotada"
                                : VARIANT_STATUS_LABEL[variant.status]}
                            </Badge>
                          </td>
                          <td className="py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openEditVariant(variant)}
                              >
                                <Pencil /> Editar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Definir ${variant.name} como padrão`}
                                disabled={pending || variant.isDefault}
                                onClick={() =>
                                  run(() =>
                                    setDefaultVariantAction({
                                      productId: data.productId,
                                      variantId: variant.id,
                                    }),
                                  )
                                }
                              >
                                <Star />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Duplicar ${variant.name}`}
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    duplicateVariantAction({
                                      productId: data.productId,
                                      variantId: variant.id,
                                    }),
                                  )
                                }
                              >
                                <Copy />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Excluir ${variant.name}`}
                                onClick={() => setConfirmDelete(variant)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {archivedVariants.length > 0 ? (
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="size-4" /> Arquivadas (
                  {archivedVariants.length})
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Saíram da loja mas continuam ligadas a pedidos antigos — por
                  isso não podem ser apagadas.
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {archivedVariants.map((variant) => (
                    <li key={variant.id}>
                      <Badge variant="muted">{variant.name}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* 3. Prévia ----------------------------------------------------------- */}
      {hasVariants && activeVariants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="size-4" /> Prévia do seletor
            </CardTitle>
            <CardDescription>
              Clique nas opções para conferir imagem, preço e estoque antes de
              publicar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VariantPreview
              variants={activeVariants}
              productPriceCents={data.productPriceCents}
              productMainImageUrl={data.productMainImageUrl}
              currency={currency}
            />
          </CardContent>
        </Card>
      ) : null}

      <VariantEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        options={data.options}
        currency={currency}
        values={editorValues}
        onValuesChange={setEditorValues}
        onSubmit={submitVariant}
        pending={pending}
        error={editorError}
      />

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir variação</DialogTitle>
            <DialogDescription>
              {confirmDelete?.orderItemCount
                ? `"${confirmDelete.name}" já foi vendida ${confirmDelete.orderItemCount} vez(es). Ela será arquivada em vez de apagada, para os pedidos antigos continuarem corretos.`
                : `"${confirmDelete?.name}" será removida definitivamente. Esta ação não pode ser desfeita.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              loading={pending}
              onClick={() => {
                const target = confirmDelete;
                if (!target) return;
                run(
                  () =>
                    deleteVariantAction({
                      productId: data.productId,
                      variantId: target.id,
                    }),
                  () => setConfirmDelete(null),
                );
              }}
            >
              <Trash2 />
              {confirmDelete?.orderItemCount ? "Arquivar" : "Excluir"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(null)}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
