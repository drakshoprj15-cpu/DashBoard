"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3,
  CloudUpload,
  Code2,
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
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";

import { formatDateTime } from "@/lib/format";
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
import { deployLandingPageAction } from "../deployment/actions";
import {
  DEPLOYMENT_STATUS_LABEL,
  HOSTING_PROVIDER_LABEL,
  type LandingDeployment,
  type LandingStatus,
} from "../types";

async function copyToClipboard(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Endereço copiado.");
  } catch {
    toast.error("O navegador bloqueou a cópia. Selecione e copie à mão.");
  }
}

export function CopyUrlButton({
  url,
  variant = "ghost",
  label = "Copiar URL",
}: {
  url: string;
  variant?: "ghost" | "outline";
  label?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={() => void copyToClipboard(url)}
    >
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
  deployment,
}: {
  id: string;
  slug: string;
  name: string;
  status: LandingStatus;
  publicUrl: string;
  hasUnpublishedChanges: boolean;
  deployment: LandingDeployment;
}) {
  const { run, pending } = useRunAction();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [showLog, setShowLog] = React.useState(false);

  function formOf(entries: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      formData.set(key, value);
    }
    return formData;
  }

  const isPublished = status === "published";

  // Uma página hospedada fora publica-se com um deploy; uma página do editor
  // publica-se com uma escrita no banco. São ações diferentes e o menu mostra
  // a que corresponde a esta página, em vez das duas.
  const isExternal = deployment.provider === "vercel";

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
            <Link href={`/landing-pages/${id}?tab=codigo`}>
              <Code2 /> Código
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/landing-pages/${id}?tab=publicacao`}>
              <Settings /> Configurações
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
              <Eye /> Visualizar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyToClipboard(publicUrl)}>
            <Copy /> Copiar URL
          </DropdownMenuItem>

          {isExternal ? (
            <DropdownMenuItem
              onSelect={() =>
                void run(deployLandingPageAction, formOf({ id }))
              }
            >
              <CloudUpload />
              {deployment.url ? "Republicar na Vercel" : "Publicar na Vercel"}
            </DropdownMenuItem>
          ) : (
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
          )}

          {isExternal ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setShowLog(true);
              }}
            >
              <Terminal /> Ver deploy
            </DropdownMenuItem>
          ) : null}

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

      {/* Registo técnico do último envio. Fica atrás de um clique de propósito:
          não é o que interessa quando corre bem, e é a primeira coisa que se
          quer ver quando falha. */}
      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Último deploy de “{name}”</DialogTitle>
            <DialogDescription>
              {deployment.updatedAt
                ? `Estado: ${DEPLOYMENT_STATUS_LABEL[deployment.status]} · ${formatDateTime(
                    deployment.updatedAt,
                    "pt-PT",
                  )}`
                : "Esta página ainda não foi enviada para a Vercel."}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">Hospedagem</dt>
            <dd>{HOSTING_PROVIDER_LABEL[deployment.provider]}</dd>
            <dt className="text-muted-foreground">Endereço</dt>
            <dd className="break-all">{deployment.url ?? "—"}</dd>
            <dt className="text-muted-foreground">Projeto</dt>
            <dd className="break-all font-mono text-xs">
              {deployment.projectId ?? "—"}
            </dd>
            <dt className="text-muted-foreground">Deploy</dt>
            <dd className="break-all font-mono text-xs">
              {deployment.deploymentId ?? "—"}
            </dd>
          </dl>

          <pre className="bg-muted max-h-72 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
            {deployment.log?.trim() || "Sem registo guardado."}
          </pre>

          <DialogFooter>
            {deployment.log ? (
              <Button
                variant="outline"
                onClick={() => void copyToClipboard(deployment.log ?? "")}
              >
                <Copy /> Copiar registo
              </Button>
            ) : null}
            <Button onClick={() => setShowLog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
