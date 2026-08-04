"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { PublicReview } from "@/features/reviews/queries";

import { blockLabel } from "../block-catalog";
import { LandingRenderer } from "../render/landing-renderer";
import type { LandingBlock, LandingSnapshot } from "../types";
import type { BuilderState } from "./use-builder-state";

export type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH: Record<Viewport, number | null> = {
  desktop: null,
  tablet: 820,
  mobile: 400,
};

/**
 * Canvas do editor: a página de verdade, renderizada pelo mesmo componente
 * que serve o cliente final, com uma camada de seleção por cima.
 *
 * O arrasto usa a API nativa do HTML — sem biblioteca extra — e cada bloco
 * também tem botões de subir/descer, para quem navega por teclado.
 */
export function BuilderCanvas({
  state,
  snapshot,
  reviews,
  pageId,
  viewport,
}: {
  state: BuilderState;
  snapshot: LandingSnapshot;
  reviews: PublicReview[];
  pageId: string;
  viewport: Viewport;
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  const blocks = state.doc.content.blocks;
  const width = VIEWPORT_WIDTH[viewport];

  function handleDrop(event: React.DragEvent, index: number) {
    event.preventDefault();
    const newType = event.dataTransfer.getData("application/x-lp-block");

    if (newType) {
      state.addBlock(newType as LandingBlock["type"], index);
    } else if (dragIndex !== null) {
      state.moveBlock(dragIndex, dragIndex < index ? index - 1 : index);
    }

    setDragIndex(null);
    setDropIndex(null);
  }

  function DropZone({ index }: { index: number }) {
    const active = dropIndex === index;
    return (
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDropIndex(index);
        }}
        onDragLeave={() =>
          setDropIndex((current) => (current === index ? null : current))
        }
        onDrop={(event) => handleDrop(event, index)}
        className={cn(
          "relative z-10 -my-1 h-2 transition-all",
          active && "bg-primary/70 my-1 h-2 rounded-full",
        )}
        aria-hidden
      />
    );
  }

  if (blocks.length === 0) {
    return (
      <div
        className="text-muted-foreground flex min-h-[60svh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleDrop(event, 0)}
      >
        <p className="font-semibold">A página está vazia</p>
        <p className="max-w-sm">
          Arraste um bloco da coluna da esquerda para aqui, ou clique num bloco
          para o acrescentar ao fim.
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "bg-background w-full origin-top transition-[width] duration-200",
          width && "rounded-xl border shadow-sm",
        )}
        style={width ? { width, maxWidth: "100%" } : undefined}
      >
        <LandingRenderer
          snapshot={snapshot}
          reviews={reviews}
          pageId={pageId}
          mode="editor"
          className="min-h-0"
          wrapBlock={(block, node) => {
            const index = blocks.findIndex((item) => item.id === block.id);
            return (
              <>
                <DropZone index={index} />
                <BlockFrame
                  block={block}
                  index={index}
                  total={blocks.length}
                  state={state}
                  onDragStart={() => setDragIndex(index)}
                >
                  {node}
                </BlockFrame>
                {index === blocks.length - 1 ? (
                  <DropZone index={blocks.length} />
                ) : null}
              </>
            );
          }}
        />
      </div>
    </div>
  );
}

function BlockFrame({
  block,
  index,
  total,
  state,
  onDragStart,
  children,
}: {
  block: LandingBlock;
  index: number;
  total: number;
  state: BuilderState;
  onDragStart: () => void;
  children: React.ReactNode;
}) {
  const selected = state.selectedBlockId === block.id;

  return (
    <div
      className={cn(
        "group relative",
        selected
          ? "outline-primary outline-2 -outline-offset-2"
          : "hover:outline-primary/40 hover:outline-1 hover:-outline-offset-1",
        block.hidden && "opacity-40",
      )}
      onClick={(event) => {
        event.stopPropagation();
        state.setSelectedBlockId(block.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.setSelectedBlockId(block.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Selecionar bloco ${blockLabel(block.type)}`}
      aria-pressed={selected}
    >
      {/* Barra de controlo — aparece ao passar o rato ou quando selecionado */}
      <div
        className={cn(
          "bg-primary text-primary-foreground absolute top-0 left-0 z-20 flex items-center gap-0.5 rounded-br-md px-1.5 py-1 text-xs transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", block.id);
            onDragStart();
          }}
          className="cursor-grab px-0.5 active:cursor-grabbing"
          aria-label="Arrastar bloco"
          role="button"
          tabIndex={-1}
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="max-w-32 truncate px-1 font-medium">
          {blockLabel(block.type)}
        </span>
        <CanvasButton
          label="Mover para cima"
          disabled={index === 0}
          onClick={() => state.moveBlock(index, index - 1)}
        >
          <ArrowUp className="size-3.5" />
        </CanvasButton>
        <CanvasButton
          label="Mover para baixo"
          disabled={index === total - 1}
          onClick={() => state.moveBlock(index, index + 1)}
        >
          <ArrowDown className="size-3.5" />
        </CanvasButton>
        <CanvasButton
          label={block.hidden ? "Mostrar bloco" : "Ocultar bloco"}
          onClick={() => state.toggleBlockVisibility(block.id)}
        >
          {block.hidden ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </CanvasButton>
        <CanvasButton
          label="Duplicar bloco"
          onClick={() => state.duplicateBlock(block.id)}
        >
          <Copy className="size-3.5" />
        </CanvasButton>
        <CanvasButton
          label="Excluir bloco"
          onClick={() => state.removeBlock(block.id)}
        >
          <Trash2 className="size-3.5" />
        </CanvasButton>
      </div>

      {/* Blocos ocultos continuam visíveis no editor, marcados. */}
      {block.hidden ? (
        <span className="bg-muted text-muted-foreground absolute top-0 right-0 z-20 rounded-bl-md px-2 py-1 text-[11px] font-medium">
          Oculto no site
        </span>
      ) : null}

      <div className="pointer-events-none">{children}</div>
    </div>
  );
}

function CanvasButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded p-1 hover:bg-black/20 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
