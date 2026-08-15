"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SAFE_RASTER_TYPES = "image/png,image/jpeg,image/webp";
const ACCEPTED_TYPES = `${SAFE_RASTER_TYPES},image/svg+xml`;

/**
 * Arrastar-e-soltar (ou clicar para escolher) uma imagem, com upload real
 * para a rota indicada em `endpoint`. Devolve a URL pública via `onChange`
 * — quem usa este componente decide onde guardar essa URL (produto,
 * checkout, marca da loja...).
 *
 * Genérico o bastante para qualquer imagem do painel: o que muda entre um
 * upload de logo e um de foto de produto é só o endpoint (e por tabela o
 * bucket/limite no servidor) — a interação de arrastar-e-soltar é a mesma.
 */
export function ImageDropzone({
  id,
  label,
  hint = "PNG, JPEG ou WebP · até 3 MB",
  endpoint,
  optional = true,
  allowRemoteUrl = true,
  allowSvg = false,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  endpoint: string;
  optional?: boolean;
  allowRemoteUrl?: boolean;
  allowSvg?: boolean;
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Falha ao enviar imagem.");
      }
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar imagem.");
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}{" "}
        {optional && (
          <span className="text-muted-foreground font-normal">(opcional)</span>
        )}
      </Label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-input hover:border-muted-foreground/40",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={allowSvg ? ACCEPTED_TYPES : SAFE_RASTER_TYPES}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {uploading ? (
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        ) : value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className="max-h-16 max-w-full object-contain"
            />
            <button
              type="button"
              aria-label={`Remover ${label.toLowerCase()}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="bg-background hover:bg-accent absolute top-2 right-2 rounded-full border p-1"
            >
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <ImagePlus className="text-muted-foreground size-6" />
        )}

        <p className="text-xs font-medium">
          {uploading
            ? "Enviando…"
            : value
              ? "Arraste outra imagem para trocar"
              : "Arraste uma imagem aqui, ou clique para escolher"}
        </p>
        <p className="text-muted-foreground text-[11px]">{hint}</p>
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      {allowRemoteUrl ? (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer select-none">
            ou cole uma URL diretamente
          </summary>
          <Input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…/imagem.png"
            className="mt-2"
          />
        </details>
      ) : null}
    </div>
  );
}
