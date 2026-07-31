"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, Palette, X } from "lucide-react";

import {
  updateCheckoutThemeAction,
  type CheckoutActionResult,
} from "@/features/checkouts/actions";
import type { CheckoutTheme } from "@/features/checkouts/queries";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";

function ColorField({
  id,
  name,
  label,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-input size-9 shrink-0 cursor-pointer rounded-md border p-0.5"
        />
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#7c3aed"
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

/** Arrastar-e-soltar (ou clicar para escolher) uma imagem, com upload real. */
function LogoDropzone({
  id,
  value,
  onChange,
}: {
  id: string;
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
      const res = await fetch("/api/checkouts/upload-logo", {
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
        Logo do cabeçalho{" "}
        <span className="text-muted-foreground font-normal">(opcional)</span>
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
          accept={ACCEPTED_TYPES}
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
              alt="Logo"
              className="max-h-16 max-w-full object-contain"
            />
            <button
              type="button"
              aria-label="Remover logo"
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
        <p className="text-muted-foreground text-[11px]">
          PNG, JPEG, WebP ou SVG · até 3 MB
        </p>
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer select-none">
          ou cole uma URL diretamente
        </summary>
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…/logo.png"
          className="mt-2"
        />
      </details>
    </div>
  );
}

export function CheckoutThemeSheet({
  checkoutId,
  checkoutName,
  theme,
}: {
  checkoutId: string;
  checkoutName: string;
  theme: CheckoutTheme;
}) {
  const [open, setOpen] = React.useState(false);
  const [primaryColor, setPrimaryColor] = React.useState(theme.primaryColor);
  const [buttonColor, setButtonColor] = React.useState(theme.buttonColor);
  const [bannerColor, setBannerColor] = React.useState(theme.bannerColor);
  const [logoUrl, setLogoUrl] = React.useState(theme.logoUrl ?? "");
  const [state, formAction, pending] = useActionState<
    CheckoutActionResult | null,
    FormData
  >(updateCheckoutThemeAction, null);

  // Fecha o sheet assim que a action responder com sucesso — ajustado durante
  // a renderização (não num efeito) para evitar um render em cascata.
  const [handledState, setHandledState] = React.useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="Personalizar checkout">
          <Palette />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Personalizar checkout</SheetTitle>
          <SheetDescription>{checkoutName}</SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <input type="hidden" name="id" value={checkoutId} />
          <input type="hidden" name="logoUrl" value={logoUrl} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && state.message && (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <LogoDropzone
            id={`logoUrl-${checkoutId}`}
            value={logoUrl}
            onChange={setLogoUrl}
          />
          <p className="text-muted-foreground -mt-2 text-xs">
            Aparece sempre centralizada no banner. Sem logo, mostra o nome da
            loja.
          </p>

          <ColorField
            id={`bannerColor-${checkoutId}`}
            name="bannerColor"
            label="Cor de fundo do banner"
            value={bannerColor}
            onChange={setBannerColor}
          />
          <ColorField
            id={`primaryColor-${checkoutId}`}
            name="primaryColor"
            label="Cor de destaque"
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <ColorField
            id={`buttonColor-${checkoutId}`}
            name="buttonColor"
            label="Cor do botão de pagamento"
            value={buttonColor}
            onChange={setButtonColor}
          />

          <div className="space-y-3 rounded-xl border p-4">
            <p className="text-muted-foreground text-xs">Pré-visualização</p>

            <div
              className="flex h-14 items-center justify-center rounded-lg"
              style={{ backgroundColor: bannerColor }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-8 max-w-[70%] object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="text-sm font-black text-white">
                  {checkoutName}
                </span>
              )}
            </div>

            <div
              className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              1
            </div>
            <button
              type="button"
              className="h-10 w-full rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: buttonColor }}
            >
              Pagar agora
            </button>
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" loading={pending}>
              Salvar
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
