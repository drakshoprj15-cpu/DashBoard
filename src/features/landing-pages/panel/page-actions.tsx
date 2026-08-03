"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  History,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Rocket,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  deleteLandingPageAction,
  duplicateLandingPageAction,
  pauseLandingPageAction,
  publishLandingPageDirectAction,
  type LandingActionResult,
} from "../actions";
import type { LandingStatus } from "../types";

export function CopyUrlButton({
  url,
  variant = "ghost",
  label = "Copiar URL",
}: {
  url: string;
  variant?: "ghost" | "outline";
  label?: string;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Endereço copiado.");
    } catch {
      toast.error("O navegador bloqueou a cópia. Selecione e copie à mão.");
    }
  }

  return (
    <Button type="button" size="sm" variant={variant} onClick={copy}>
      <Copy /> {label}
    </Button>
  );
}

/** Executa uma action de formulário e mostra o resultado. */
function useRunAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (
      action: (formData: FormData) => Promise<LandingActionResult>,
      formData: FormData,
    ) => {
      setPending(true);
      try {
        const result = await action(formData);
        if (result.ok) {
          toast.success(result.message ?? "Feito.");
          router.refresh();
        } else {
          toast.error(result.error ?? "Não foi possível concluir.");
        }
        return result;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending };
}

export function LandingPageActions({
  id,
  slug,
  name,
  status,
  publicUrl,
  hasUnpublishedChanges,
}: {
  id: string;
  slug: string;
  name: string;
  status: LandingStatus;
  publicUrl: string;
  hasUnpublishedChanges: boolean;
}) {
  const { run, pending } = useRunAction();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");

  function formOf(entries: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      formData.set(key, value);
    }
    return formData;
  }

  const isPublished = status === "published";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Ações de ${name}`}
            disabled={pending}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href={`/landing-pages/${id}`}>
              <Pencil /> Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/landing-pages/${id}?tab=metricas`}>
              <BarChart3 /> Ver métricas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/landing-pages/${id}?tab=historico`}>
              <History /> Histórico de versões
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/landing-pages/dominios">
              <Globe /> Configurar domínio
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {isPublished ? (
            <DropdownMenuItem asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir página
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={`/landing-pages/${id}?tab=publicacao`}>
              <Eye /> Pré-visualizar
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() =>
              void run(publishLandingPageDirectAction, formOf({ id }))
            }
          >
            <Rocket />
            {isPublished
              ? hasUnpublishedChanges
                ? "Republicar alterações"
                : "Republicar"
              : "Publicar"}
          </DropdownMenuItem>

          {status === "paused" ? (
            <DropdownMenuItem
              onSelect={() =>
                void run(pauseLandingPageAction, formOf({ id, resume: "true" }))
              }
            >
              <Play /> Retomar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => void run(pauseLandingPageAction, formOf({ id }))}
            >
              <Pause /> Pausar
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onSelect={() =>
              void run(duplicateLandingPageAction, formOf({ id }))
            }
          >
            <Copy /> Duplicar
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              setConfirmDelete(true);
            }}
          >
            <Trash2 /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir “{name}”?</DialogTitle>
            <DialogDescription>
              A página sai do ar imediatamente e deixa de responder no endereço
              público. O histórico de versões e as métricas são preservados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`confirm-${id}`}>
              Escreva <code className="bg-muted rounded px-1">{slug}</code> para
              confirmar
            </Label>
            <Input
              id={`confirm-${id}`}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={confirmText.trim().toLowerCase() !== slug.toLowerCase()}
              onClick={async () => {
                const result = await run(
                  deleteLandingPageAction,
                  formOf({ id, confirm: confirmText }),
                );
                if (result.ok) {
                  setConfirmDelete(false);
                  setConfirmText("");
                }
              }}
            >
              <Trash2 /> Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
