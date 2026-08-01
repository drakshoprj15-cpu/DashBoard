"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { OnMount } from "@monaco-editor/react";
import { Check, Copy, Maximize2, Minimize2, Sparkles, TextSelect } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      Carregando editor…
    </div>
  ),
});

type MonacoEditorInstance = Parameters<OnMount>[0];

export interface CodeEditorProps {
  language: "html" | "css" | "javascript";
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  height?: number | string;
  className?: string;
}

/**
 * Editor de código profissional (Monaco): syntax highlighting, linhas,
 * busca (Ctrl+F nativo do Monaco), recuo automático, quebra de linha,
 * formatar, copiar e tela cheia. Ctrl+S/Cmd+S chama `onSave`.
 */
export function CodeEditor({
  language,
  value,
  onChange,
  onSave,
  readOnly = false,
  height = 320,
  className,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const [fullscreen, setFullscreen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const editorRef = React.useRef<MonacoEditorInstance | null>(null);

  // O atalho é registado uma única vez no mount do Monaco; a ref garante que
  // ele sempre chama a versão mais recente de `onSave` (que muda a cada
  // render por causa da closure sobre o estado do formulário).
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleMount: OnMount = React.useCallback((editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard indisponível (ex.: contexto não seguro) — sem crash.
    }
  }

  function handleFormat() {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }

  function handleSelectAll() {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    editor.focus();
    editor.setSelection(model.getFullModelRange());
  }

  return (
    <div
      className={cn(
        "border-input bg-card flex flex-col overflow-hidden rounded-md border",
        fullscreen && "fixed inset-4 z-50 shadow-lg",
        className,
      )}
    >
      <div className="bg-muted/40 flex items-center justify-between gap-2 border-b px-2 py-1">
        <span className="text-muted-foreground px-1 font-mono text-[11px] tracking-wide uppercase">
          {language}
          {readOnly ? " · somente leitura" : ""}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={handleSelectAll}
            title="Selecionar tudo"
          >
            <TextSelect />
          </Button>
          {!readOnly && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={handleFormat}
              title="Formatar código"
            >
              <Sparkles />
            </Button>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={handleCopy}
            title="Copiar código"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>
      <div style={{ height: fullscreen ? "calc(100% - 37px)" : height }}>
        <Editor
          language={language}
          value={value}
          onChange={(v) => onChange?.(v ?? "")}
          onMount={handleMount}
          theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
          options={{
            readOnly,
            domReadOnly: readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: readOnly ? "none" : "line",
          }}
        />
      </div>
    </div>
  );
}
