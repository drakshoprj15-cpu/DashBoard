"use client";

import * as React from "react";

import { saveLandingDraftAction } from "../actions";
import { createBlock } from "../block-catalog";
import type {
  BlockPropValue,
  BlockStyle,
  BlockType,
  LandingBlock,
  LandingContentDoc,
  LandingCustomCode,
  LandingSeo,
  LandingTheme,
  LandingTracking,
} from "../types";

export interface BuilderDoc {
  content: LandingContentDoc;
  theme: LandingTheme;
  seo: LandingSeo;
  tracking: LandingTracking;
  customCode: LandingCustomCode;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 1200;
const HISTORY_LIMIT = 50;

/**
 * Estado do editor visual.
 *
 * Guarda um único documento em memória e grava-o com atraso (debounce) —
 * arrastar um bloco ou digitar um título não pode significar um pedido ao
 * servidor por tecla. A pilha de desfazer guarda apenas o documento, não a
 * seleção: desfazer devolve o conteúdo, não o cursor.
 */
interface HistoryState {
  present: BuilderDoc;
  past: BuilderDoc[];
  future: BuilderDoc[];
  /** Há alterações ainda não gravadas no servidor? */
  dirty: boolean;
}

export function useBuilderState(pageId: string, initial: BuilderDoc) {
  const [history, setHistory] = React.useState<HistoryState>({
    present: initial,
    past: [],
    future: [],
    dirty: false,
  });
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(
    initial.content.blocks[0]?.id ?? null,
  );
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [saveError, setSaveError] = React.useState("");

  const doc = history.present;

  /** Aplica uma mudança e empilha o estado anterior para desfazer. */
  const update = React.useCallback(
    (recipe: (current: BuilderDoc) => BuilderDoc) => {
      setHistory((current) => {
        const next = recipe(current.present);
        if (next === current.present) return current;
        return {
          present: next,
          past: [...current.past.slice(-HISTORY_LIMIT), current.present],
          future: [],
          dirty: true,
        };
      });
    },
    [],
  );

  const save = React.useCallback(async () => {
    setSaveState("saving");
    const result = await saveLandingDraftAction({ id: pageId, ...doc });

    if (result.ok) {
      // Só limpa a marca se o documento não mudou durante a gravação.
      setHistory((current) =>
        current.present === doc ? { ...current, dirty: false } : current,
      );
      setSaveState("saved");
      setSaveError("");
    } else {
      setSaveState("error");
      setSaveError(result.error ?? "Não foi possível salvar.");
    }
  }, [pageId, doc]);

  // Autosave: dispara depois de o utilizador parar de mexer.
  React.useEffect(() => {
    if (!history.dirty) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [history.dirty, save]);

  // Aviso ao fechar o separador com alterações por gravar.
  React.useEffect(() => {
    if (!history.dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [history.dirty]);

  const undo = React.useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        present: previous,
        past: current.past.slice(0, -1),
        future: [current.present, ...current.future.slice(0, HISTORY_LIMIT)],
        dirty: true,
      };
    });
  }, []);

  const redo = React.useCallback(() => {
    setHistory((current) => {
      const [next, ...rest] = current.future;
      if (!next) return current;
      return {
        present: next,
        past: [...current.past, current.present],
        future: rest,
        dirty: true,
      };
    });
  }, []);

  // ---- Operações sobre blocos ---------------------------------------------

  const setBlocks = React.useCallback(
    (recipe: (blocks: LandingBlock[]) => LandingBlock[]) => {
      update((current) => ({
        ...current,
        content: { ...current.content, blocks: recipe(current.content.blocks) },
      }));
    },
    [update],
  );

  const addBlock = React.useCallback(
    (type: BlockType, atIndex?: number) => {
      const block = createBlock(type);
      setBlocks((blocks) => {
        const next = [...blocks];
        next.splice(atIndex ?? next.length, 0, block);
        return next;
      });
      setSelectedBlockId(block.id);
      return block.id;
    },
    [setBlocks],
  );

  const removeBlock = React.useCallback(
    (id: string) => {
      setBlocks((blocks) => blocks.filter((block) => block.id !== id));
      setSelectedBlockId((current) => (current === id ? null : current));
    },
    [setBlocks],
  );

  const duplicateBlock = React.useCallback(
    (id: string) => {
      setBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === id);
        if (index < 0) return blocks;
        const copy: LandingBlock = {
          ...blocks[index],
          id: `b_${Math.random().toString(36).slice(2, 10)}`,
          props: { ...blocks[index].props },
          style: { ...blocks[index].style },
        };
        const next = [...blocks];
        next.splice(index + 1, 0, copy);
        return next;
      });
    },
    [setBlocks],
  );

  const moveBlock = React.useCallback(
    (from: number, to: number) => {
      setBlocks((blocks) => {
        if (from === to || from < 0 || from >= blocks.length) return blocks;
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
        return next;
      });
    },
    [setBlocks],
  );

  const toggleBlockVisibility = React.useCallback(
    (id: string) => {
      setBlocks((blocks) =>
        blocks.map((block) =>
          block.id === id ? { ...block, hidden: !block.hidden } : block,
        ),
      );
    },
    [setBlocks],
  );

  const updateBlockProp = React.useCallback(
    (id: string, key: string, value: BlockPropValue) => {
      setBlocks((blocks) =>
        blocks.map((block) =>
          block.id === id
            ? { ...block, props: { ...block.props, [key]: value } }
            : block,
        ),
      );
    },
    [setBlocks],
  );

  const updateBlockStyle = React.useCallback(
    (id: string, patch: Partial<BlockStyle>) => {
      setBlocks((blocks) =>
        blocks.map((block) =>
          block.id === id
            ? { ...block, style: { ...block.style, ...patch } }
            : block,
        ),
      );
    },
    [setBlocks],
  );

  const updateBlockMeta = React.useCallback(
    (id: string, patch: Partial<Pick<LandingBlock, "anchorId">>) => {
      setBlocks((blocks) =>
        blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
      );
    },
    [setBlocks],
  );

  // ---- Seções de configuração ---------------------------------------------

  const setTheme = React.useCallback(
    (patch: Partial<LandingTheme>) =>
      update((current) => ({ ...current, theme: { ...current.theme, ...patch } })),
    [update],
  );

  const setSeo = React.useCallback(
    (patch: Partial<LandingSeo>) =>
      update((current) => ({ ...current, seo: { ...current.seo, ...patch } })),
    [update],
  );

  const setTracking = React.useCallback(
    (patch: Partial<LandingTracking>) =>
      update((current) => ({
        ...current,
        tracking: { ...current.tracking, ...patch },
      })),
    [update],
  );

  const setCustomCode = React.useCallback(
    (patch: Partial<LandingCustomCode>) =>
      update((current) => ({
        ...current,
        customCode: { ...current.customCode, ...patch },
      })),
    [update],
  );

  const selectedBlock =
    doc.content.blocks.find((block) => block.id === selectedBlockId) ?? null;

  return {
    doc,
    selectedBlock,
    selectedBlockId,
    setSelectedBlockId,
    saveState,
    saveError,
    isDirty: history.dirty,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    save,
    undo,
    redo,
    addBlock,
    removeBlock,
    duplicateBlock,
    moveBlock,
    toggleBlockVisibility,
    updateBlockProp,
    updateBlockStyle,
    updateBlockMeta,
    setTheme,
    setSeo,
    setTracking,
    setCustomCode,
  };
}

export type BuilderState = ReturnType<typeof useBuilderState>;
