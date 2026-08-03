"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

import { buildPriceView, effectivePriceCents, isPurchasable } from "./pricing";
import type { VariantRow } from "./types";

/**
 * Prévia do seletor como o cliente verá, dentro do painel.
 *
 * Usa exatamente as mesmas funções de preço da página pública, então o que
 * aparece aqui (desconto, economia, esgotado) é o que sairá no ar. O destaque
 * segue o magenta do Infinity — na landing quem manda é o tema da página.
 */
export function VariantPreview({
  variants,
  productPriceCents,
  productMainImageUrl,
  currency,
}: {
  variants: VariantRow[];
  productPriceCents: number;
  productMainImageUrl: string | null;
  currency: string;
}) {
  const visible = React.useMemo(
    () => variants.filter((variant) => !variant.archivedAt),
    [variants],
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  if (visible.length === 0) return null;

  // Seleção derivada: se a variação escolhida sumir (excluída ou arquivada
  // enquanto o painel estava aberto), a prévia cai na padrão sozinha.
  const selected =
    visible.find((variant) => variant.id === selectedId) ??
    visible.find((variant) => variant.isDefault) ??
    visible[0];
  const gallery =
    selected.media.length > 0
      ? selected.media.map((item) => item.url)
      : [selected.mainImageUrl, productMainImageUrl].filter(
          (url): url is string => Boolean(url),
        );

  const price = buildPriceView(
    effectivePriceCents(selected.priceCents, productPriceCents),
    selected.compareAtPriceCents,
  );
  const available = isPurchasable(selected);

  return (
    <div className="grid gap-5 md:grid-cols-[220px_1fr]">
      <div className="bg-muted/40 flex aspect-square items-center justify-center overflow-hidden rounded-xl border">
        {gallery[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gallery[0]}
            alt={selected.publicName ?? selected.name}
            className="size-full object-contain p-3"
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 text-xs">
            <ImageOff className="size-6" />
            Sem foto nesta variação
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {selected.optionValues[0]?.optionName ?? "Opções"}
          </p>
          <div
            role="radiogroup"
            aria-label="Prévia do seletor de variações"
            className="mt-2 flex flex-wrap gap-2"
          >
            {visible.map((variant) => {
              const isSelected = variant.id === selected.id;
              const soldOut = !isPurchasable(variant);
              const variantPrice = effectivePriceCents(
                variant.priceCents,
                productPriceCents,
              );

              return (
                <button
                  key={variant.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedId(variant.id)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-muted-foreground/40",
                    soldOut && "opacity-50",
                  )}
                >
                  {variant.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={variant.thumbnailUrl}
                      alt=""
                      className="size-8 rounded object-cover"
                    />
                  ) : variant.hexColor ? (
                    <span
                      className="size-5 rounded-full border"
                      style={{ backgroundColor: variant.hexColor }}
                      aria-hidden
                    />
                  ) : null}
                  <span>
                    <span className="block font-medium">
                      {variant.publicName ?? variant.name}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {soldOut
                        ? "Esgotado"
                        : formatMoney(variantPrice, currency, "pt-PT")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-black tracking-tight">
            {formatMoney(price.priceCents, currency, "pt-PT")}
          </span>
          {price.showCompareAt ? (
            <span className="text-muted-foreground line-through">
              {formatMoney(
                price.compareAtPriceCents as number,
                currency,
                "pt-PT",
              )}
            </span>
          ) : null}
          {price.discountPercent ? (
            <Badge variant="success">-{price.discountPercent}%</Badge>
          ) : null}
        </div>

        <div className="text-muted-foreground space-y-1 text-sm">
          {price.savingsCents > 0 ? (
            <p className="text-success font-medium">
              Economia de {formatMoney(price.savingsCents, currency, "pt-PT")}
            </p>
          ) : null}
          {selected.sku ? (
            <p className="font-mono text-xs">SKU {selected.sku}</p>
          ) : null}
          <p>
            {!available
              ? "Indisponível — o botão de compra fica bloqueado."
              : selected.trackInventory
                ? `${selected.stockQuantity} em estoque`
                : "Sem controlo de estoque"}
          </p>
          {selected.media.length === 0 ? (
            <p className="text-warning-foreground dark:text-warning text-xs">
              Esta variação ainda não tem galeria própria — a página mostrará as
              fotos gerais do produto.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
