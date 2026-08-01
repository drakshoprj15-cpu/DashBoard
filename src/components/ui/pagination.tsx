"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  locale?: string;
}

/** Paginação simples (anterior/próxima) — os dados já vêm paginados do backend. */
function Pagination({
  page,
  pageSize,
  total,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  locale = "pt-PT",
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="navigation"
      aria-label="Paginação"
    >
      <p className="text-muted-foreground text-xs">
        {total === 0
          ? "Nenhum resultado"
          : `${formatNumber(from, locale)}–${formatNumber(to, locale)} de ${formatNumber(total, locale)}`}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && pageSizeOptions && (
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            Por página
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="border-input bg-card h-8 rounded-md border px-2 text-xs shadow-xs outline-none"
              aria-label="Itens por página"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground min-w-[70px] text-center text-xs">
            Página {formatNumber(page, locale)} de {formatNumber(pageCount, locale)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

export { Pagination };
