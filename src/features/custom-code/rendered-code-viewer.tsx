"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { CodeEditor } from "@/components/code-editor";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface RenderedCodeViewerProps {
  productId: string;
  productSlug: string;
  publicUrl: string;
}

interface RenderedHtmlResponse {
  ok: boolean;
  html?: string;
  error?: string;
  notPublished?: boolean;
}

interface FetchState {
  status: "loading" | "ok" | "error";
  html?: string;
  error?: string;
  notPublished?: boolean;
}

/** Busca o HTML renderizado — sem tocar em estado, só resolve o resultado. */
async function fetchRenderedHtml(productId: string): Promise<FetchState> {
  try {
    const res = await fetch(`/api/products/${productId}/rendered-html`, {
      cache: "no-store",
    });
    const data = (await res.json()) as RenderedHtmlResponse;
    if (data.ok && data.html !== undefined) {
      return { status: "ok", html: data.html };
    }
    return {
      status: "error",
      error: data.error ?? "Não foi possível carregar o código.",
      notPublished: Boolean(data.notPublished),
    };
  } catch {
    return {
      status: "error",
      error: "Não foi possível carregar o código. Verifique a conexão e tente novamente.",
    };
  }
}

/**
 * Mostra o HTML final gerado pela rota pública (`/api/products/[id]/rendered-html`)
 * em modo somente leitura — nunca uma cópia reconstruída do código.
 */
export function RenderedCodeViewer({
  productId,
  productSlug,
  publicUrl,
}: RenderedCodeViewerProps) {
  const [state, setState] = React.useState<FetchState>({ status: "loading" });

  // Usado pelos botões "Atualizar"/"Tentar novamente": evento síncrono, não
  // efeito — pode marcar "loading" antes de refazer a busca sem disparo em
  // cascata.
  const reload = React.useCallback(() => {
    setState({ status: "loading" });
    fetchRenderedHtml(productId).then(setState);
  }, [productId]);

  // Carga inicial: o estado já nasce "loading", então o efeito só assina o
  // resultado da busca (sem setState síncrono no corpo do efeito).
  React.useEffect(() => {
    let cancelled = false;
    fetchRenderedHtml(productId).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  function handleDownload() {
    if (state.status !== "ok" || !state.html) return;
    const blob = new Blob([state.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${productSlug || "landing-page"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("HTML baixado.");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          HTML renderizado da página publicada — somente leitura.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reload}
            disabled={state.status === "loading"}
          >
            <RefreshCw className={state.status === "loading" ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={state.status !== "ok"}
          >
            <Download /> Baixar HTML
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Abrir página
            </a>
          </Button>
        </div>
      </div>

      {state.status === "loading" && (
        <div className="text-muted-foreground flex h-80 items-center justify-center gap-2 rounded-md border text-sm">
          <Loader2 className="animate-spin" /> Carregando código…
        </div>
      )}

      {state.status === "error" && (
        <Alert variant={state.notPublished ? "info" : "destructive"}>
          <AlertTriangle />
          <AlertTitle>
            {state.notPublished ? "Landing page não publicada" : "Não foi possível carregar"}
          </AlertTitle>
          <AlertDescription>
            <p>{state.error}</p>
            {!state.notPublished && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={reload}
              >
                Tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {state.status === "ok" && (
        <CodeEditor language="html" value={state.html ?? ""} readOnly height={420} />
      )}
    </div>
  );
}
