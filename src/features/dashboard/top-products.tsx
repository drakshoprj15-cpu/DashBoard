"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Package } from "lucide-react";

import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TopProductRow } from "@/features/dashboard/queries";

export interface TopProductsProps {
  products: TopProductRow[];
  currency: string;
}

type SortBy = "units" | "revenue";

const BAR_CLASSES = [
  "bg-fuchsia-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-amber-300",
  "bg-rose-400",
];

export function TopProducts({ products, currency }: TopProductsProps) {
  const [sortBy, setSortBy] = React.useState<SortBy>("revenue");

  const sorted = React.useMemo(
    () =>
      [...products].sort((a, b) =>
        sortBy === "units"
          ? b.units - a.units
          : b.revenueCents - a.revenueCents,
      ),
    [products, sortBy],
  );
  const maxValue = Math.max(
    1,
    ...sorted.map((product) =>
      sortBy === "units" ? product.units : product.revenueCents,
    ),
  );
  const listedRevenue = products.reduce(
    (total, product) => total + product.revenueCents,
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Ordenar produtos"
          className="inline-flex h-8 w-fit items-center rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5"
        >
          {(
            [
              { key: "revenue", label: "Receita" },
              { key: "units", label: "Quantidade" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={sortBy === option.key}
              onClick={() => setSortBy(option.key)}
              className={cn(
                "h-7 rounded-sm px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50",
                sortBy === option.key
                  ? "bg-[#e91e8f] text-white shadow-[0_5px_16px_rgba(233,30,143,0.25)]"
                  : "text-[#8d98a8] hover:text-[#edf2f8]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Link
          href="/catalogo/produtos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-fuchsia-300 transition-colors hover:text-fuchsia-200"
        >
          Ver catálogo
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-[#758195]">
            <Package className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-[#c3cbd7]">
            Nenhum produto vendido neste período.
          </p>
          <p className="mt-1 text-xs text-[#758195]">
            O ranking será preenchido com as próximas vendas aprovadas.
          </p>
        </div>
      ) : (
        <ol className="grid overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015] sm:grid-cols-2 xl:grid-cols-5">
          {sorted.map((product, index) => {
            const value =
              sortBy === "units" ? product.units : product.revenueCents;
            const widthPercent = (value / maxValue) * 100;
            const revenueShare =
              listedRevenue > 0
                ? (product.revenueCents / listedRevenue) * 100
                : 0;

            return (
              <li
                key={product.productId ?? product.name}
                className="min-w-0 border-b border-white/[0.06] p-4 last:border-b-0 sm:border-r sm:[&:nth-child(even)]:border-r-0 xl:border-b-0 xl:border-r xl:[&:nth-child(even)]:border-r xl:last:border-r-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[#5f6b7d]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-white/[0.05]">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#748094]">
                        <Package className="size-4" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <p className="min-w-0 truncate text-sm font-medium text-[#e4e9f0]">
                    {product.name}
                  </p>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#f7f9fc]">
                      {formatMoney(product.revenueCents, currency, "pt-BR")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#6f7b8d]">
                      {formatNumber(product.units)}{" "}
                      {product.units === 1 ? "vendido" : "vendidos"}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#9aa5b5]">
                    {revenueShare.toLocaleString("pt-BR", {
                      maximumFractionDigits: 0,
                    })}
                    %
                  </span>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      BAR_CLASSES[index % BAR_CLASSES.length],
                    )}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
