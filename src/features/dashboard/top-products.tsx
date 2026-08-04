"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";

import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TopProductRow } from "@/features/dashboard/queries";

export interface TopProductsProps {
  products: TopProductRow[];
  currency: string;
}

type SortBy = "units" | "revenue";

export function TopProducts({ products, currency }: TopProductsProps) {
  const [sortBy, setSortBy] = React.useState<SortBy>("revenue");

  const sorted = [...products].sort((a, b) =>
    sortBy === "units" ? b.units - a.units : b.revenueCents - a.revenueCents,
  );

  const maxValue = Math.max(
    1,
    ...sorted.map((p) => (sortBy === "units" ? p.units : p.revenueCents)),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {(
            [
              { key: "revenue", label: "Receita" },
              { key: "units", label: "Quantidade" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                sortBy === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Link
          href="/catalogo/produtos"
          className="text-primary text-xs font-medium hover:underline"
        >
          Ver catálogo
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
          Sem dados no período
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((p) => {
            const value = sortBy === "units" ? p.units : p.revenueCents;
            const widthPercent = Math.max(4, (value / maxValue) * 100);
            return (
              <li
                key={p.productId ?? p.name}
                className="flex items-center gap-3"
              >
                <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-lg">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center">
                      <Package className="size-4" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {formatNumber(p.units)}{" "}
                      {p.units === 1 ? "unid." : "unids."}
                    </span>
                    <span className="font-semibold">
                      {formatMoney(p.revenueCents, currency, "pt-PT")}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
