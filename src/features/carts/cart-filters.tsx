"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { PAYMENT_METHOD_LABEL } from "@/features/carts/status";
import type { ProductOption } from "@/features/products/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface CartFiltersState {
  q: string;
  method: string;
  gateway: string;
  country: string;
  currency: string;
  productId: string;
  from: string;
  to: string;
}

export const EMPTY_CART_FILTERS: CartFiltersState = {
  q: "",
  method: "",
  gateway: "",
  country: "",
  currency: "",
  productId: "",
  from: "",
  to: "",
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function quickRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

const selectClass =
  "border-input bg-card h-9 rounded-md border px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function CartFilters({
  value,
  onChange,
  onClear,
  products,
  hasActiveFilters,
}: {
  value: CartFiltersState;
  onChange: (patch: Partial<CartFiltersState>) => void;
  onClear: () => void;
  products: ProductOption[];
  hasActiveFilters: boolean;
}) {
  const [searchDraft, setSearchDraft] = React.useState(value.q);

  // Mantém o rascunho sincronizado quando o filtro muda por fora (ex.: "Limpar
  // filtros") — ajuste síncrono durante a renderização, não em efeito.
  const [prevOutsideQ, setPrevOutsideQ] = React.useState(value.q);
  if (value.q !== prevOutsideQ) {
    setPrevOutsideQ(value.q);
    setSearchDraft(value.q);
  }

  // Debounce: só propaga a busca 400ms após o usuário parar de digitar.
  React.useEffect(() => {
    if (searchDraft === value.q) return;
    const timer = setTimeout(() => onChange({ q: searchDraft }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Buscar por nome, e-mail, telefone, documento, referência ou ID da transação"
          className="pl-9"
          aria-label="Buscar carrinhos"
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs font-normal">Produto</Label>
          <select
            value={value.productId}
            onChange={(e) => onChange({ productId: e.target.value })}
            className={selectClass}
            aria-label="Filtrar por produto"
          >
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs font-normal">Pagamento</Label>
          <select
            value={value.method}
            onChange={(e) => onChange({ method: e.target.value })}
            className={selectClass}
            aria-label="Filtrar por forma de pagamento"
          >
            <option value="">Todas as formas</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs font-normal">Gateway</Label>
          <select
            value={value.gateway}
            onChange={(e) => onChange({ gateway: e.target.value })}
            className={selectClass}
            aria-label="Filtrar por gateway"
          >
            <option value="">Todos os gateways</option>
            <option value="broski">Broski</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs font-normal">País</Label>
          <Input
            value={value.country}
            onChange={(e) => onChange({ country: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="PT"
            className="h-9 w-16"
            aria-label="Filtrar por país"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs font-normal">Moeda</Label>
          <select
            value={value.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
            className={selectClass}
            aria-label="Filtrar por moeda"
          >
            <option value="">Todas</option>
            <option value="EUR">EUR</option>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs font-normal">De</Label>
          <Input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ from: e.target.value })}
            className="h-9"
            aria-label="Data inicial"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs font-normal">Até</Label>
          <Input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ to: e.target.value })}
            className="h-9"
            aria-label="Data final"
          />
        </div>

        <div className="flex gap-1.5 pb-0.5">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(quickRange(1))}>
            Hoje
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(quickRange(7))}>
            7 dias
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(quickRange(30))}>
            30 dias
          </Button>
        </div>

        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground pb-0.5">
            <X /> Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
