"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  BLOCK_GROUP_LABELS,
  BLOCK_LIST,
  type BlockGroup,
  type BlockDef,
} from "../block-catalog";
import type { BlockType } from "../types";

/**
 * Paleta de blocos. Cada item pode ser clicado (acrescenta ao fim) ou
 * arrastado até à posição desejada no canvas — teclado e rato chegam ao
 * mesmo resultado.
 */
export function BlockPalette({
  onAdd,
  hasProduct,
}: {
  onAdd: (type: BlockType) => void;
  hasProduct: boolean;
}) {
  const [query, setQuery] = React.useState("");

  const groups = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const editableBlocks = BLOCK_LIST.filter(
      (block) => block.type !== "header" && block.type !== "footer",
    );
    const filtered = term
      ? editableBlocks.filter(
          (block) =>
            block.label.toLowerCase().includes(term) ||
            block.description.toLowerCase().includes(term),
        )
      : editableBlocks;

    const byGroup = new Map<BlockGroup, BlockDef[]>();
    for (const block of filtered) {
      const list = byGroup.get(block.group) ?? [];
      list.push(block);
      byGroup.set(block.group, list);
    }
    return [...byGroup.entries()];
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar bloco"
            className="pl-9"
            aria-label="Buscar bloco"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {groups.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            Nenhum bloco encontrado.
          </p>
        ) : (
          groups.map(([group, blocks]) => (
            <section key={group} className="mb-4 last:mb-0">
              <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">
                {BLOCK_GROUP_LABELS[group]}
              </h3>
              <ul className="space-y-1.5">
                {blocks.map((block) => {
                  const needsProduct = block.requiresProduct && !hasProduct;
                  return (
                    <li key={block.type}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                "application/x-lp-block",
                                block.type,
                              );
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => onAdd(block.type)}
                            className={cn(
                              "hover:border-primary/50 hover:bg-accent group flex w-full cursor-grab items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors active:cursor-grabbing",
                              needsProduct && "opacity-60",
                            )}
                          >
                            <span className="bg-muted text-muted-foreground group-hover:text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
                              <block.icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {block.label}
                              </span>
                              <span className="text-muted-foreground block truncate text-[11px]">
                                {block.description}
                              </span>
                            </span>
                            <Plus className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-64">
                          {needsProduct
                            ? "Este bloco só mostra conteúdo depois de vincular um produto na aba Produto."
                            : block.description}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
