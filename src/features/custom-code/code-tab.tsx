"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Monitor,
  Radar,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  saveCustomCodeAction,
  type CustomCodeActionResult,
} from "@/features/custom-code/actions";
import { RenderedCodeViewer } from "@/features/custom-code/rendered-code-viewer";
import { CodeEditor } from "@/components/code-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface CodeTabInitialData {
  metaPixelId: string;
  metaPixelEnabled: boolean;
  customHeadCode: string;
  customBodyStartCode: string;
  customBodyEndCode: string;
  customCss: string;
  customJavaScript: string;
  updatedAt: string | null;
}

interface CodeTabProps {
  productId: string;
  productSlug: string;
  publicUrl: string;
  isPublished: boolean;
  initial: CodeTabInitialData;
}

interface FormState {
  metaPixelId: string;
  metaPixelEnabled: boolean;
  customHeadCode: string;
  customBodyStartCode: string;
  customBodyEndCode: string;
  customCss: string;
  customJavaScript: string;
}

function toFormState(data: CodeTabInitialData): FormState {
  return {
    metaPixelId: data.metaPixelId,
    metaPixelEnabled: data.metaPixelEnabled,
    customHeadCode: data.customHeadCode,
    customBodyStartCode: data.customBodyStartCode,
    customBodyEndCode: data.customBodyEndCode,
    customCss: data.customCss,
    customJavaScript: data.customJavaScript,
  };
}

type VerifyState = "idle" | "loading" | "found" | "missing" | "error";

export function CodeTab({
  productId,
  productSlug,
  publicUrl,
  isPublished,
  initial,
}: CodeTabProps) {
  const [state, formAction, pending] = useActionState<
    CustomCodeActionResult | null,
    FormData
  >(saveCustomCodeAction, null);

  const [form, setForm] = React.useState<FormState>(() => toFormState(initial));
  const [savedSnapshot, setSavedSnapshot] = React.useState<FormState>(() =>
    toFormState(initial),
  );
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(initial.updatedAt);
  const [verify, setVerify] = React.useState<VerifyState>("idle");
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const [previewKey, setPreviewKey] = React.useState(0);

  const formRef = React.useRef<HTMLFormElement>(null);
  const pendingSnapshotRef = React.useRef<FormState | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(savedSnapshot);

  const pixelIdError =
    form.metaPixelId && !/^\d{15,16}$/.test(form.metaPixelId)
      ? "O ID do Meta Pixel tem 15 ou 16 dígitos"
      : null;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "Código salvo com sucesso.");
      if (pendingSnapshotRef.current) setSavedSnapshot(pendingSnapshotRef.current);
      if (state.updatedAt) setUpdatedAt(state.updatedAt);
      setPreviewKey((k) => k + 1);
      setVerify("idle");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  // Aviso ao sair com alterações não salvas.
  React.useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function handleSubmit() {
    pendingSnapshotRef.current = form;
  }

  function triggerSave() {
    formRef.current?.requestSubmit();
  }

  function handleDiscard() {
    if (dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    setForm(savedSnapshot);
  }

  async function handleVerify() {
    setVerify("loading");
    try {
      const res = await fetch(`/api/products/${productId}/rendered-html`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { ok: boolean; html?: string };
      if (!data.ok || typeof data.html !== "string") {
        setVerify("error");
        return;
      }
      const found =
        savedSnapshot.metaPixelEnabled &&
        Boolean(savedSnapshot.metaPixelId) &&
        data.html.includes(savedSnapshot.metaPixelId);
      setVerify(found ? "found" : "missing");
    } catch {
      setVerify("error");
    }
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="customHeadCode" value={form.customHeadCode} />
      <input type="hidden" name="customBodyStartCode" value={form.customBodyStartCode} />
      <input type="hidden" name="customBodyEndCode" value={form.customBodyEndCode} />
      <input type="hidden" name="customCss" value={form.customCss} />
      <input type="hidden" name="customJavaScript" value={form.customJavaScript} />

      {/* Barra de estado e ações */}
      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dirty ? (
            <Badge variant="warning">Alterações não salvas</Badge>
          ) : (
            <Badge variant="muted">Tudo salvo</Badge>
          )}
          {updatedAt && (
            <span className="text-muted-foreground">
              Última atualização: {formatDateTime(updatedAt)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDiscard}
            disabled={!dirty || pending}
          >
            <RotateCcw /> Descartar alterações
          </Button>
          <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
            <Save /> Salvar alterações
          </Button>
        </div>
      </div>

      {/* Meta Pixel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="text-muted-foreground size-4" /> Meta Pixel
          </CardTitle>
          <CardDescription>
            Configuração rápida só para esta landing page — não altera os
            pixels cadastrados em{" "}
            <Link href="/pixel" className="underline underline-offset-2">
              Pixel
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="space-y-2">
              <Label htmlFor="metaPixelId">ID do Pixel</Label>
              <Input
                id="metaPixelId"
                name="metaPixelId"
                inputMode="numeric"
                placeholder="Ex.: 123456789012345"
                value={form.metaPixelId}
                onChange={(e) =>
                  setField("metaPixelId", e.target.value.replace(/\D/g, "").slice(0, 16))
                }
                aria-invalid={Boolean(pixelIdError)}
              />
              <p className={cn("text-xs", pixelIdError ? "text-destructive" : "text-muted-foreground")}>
                {pixelIdError ?? "15 ou 16 dígitos, só números."}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1 sm:pt-7">
              <Switch
                id="metaPixelEnabled"
                name="metaPixelEnabled"
                checked={form.metaPixelEnabled}
                onCheckedChange={(v) => setField("metaPixelEnabled", v === true)}
              />
              <Label htmlFor="metaPixelEnabled" className="cursor-pointer">
                Ativar Meta Pixel
              </Label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={form.metaPixelEnabled ? "success" : "muted"}>
              {form.metaPixelEnabled ? "Pixel ativo" : "Pixel desativado"}
            </Badge>
          </div>

          <Alert variant="info">
            <Info />
            <AlertDescription>
              O evento <strong>PageView</strong> é enviado automaticamente
              sempre que esta landing page é aberta, assim que o Pixel for
              ativado e salvo.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" loading={pending}>
              <Save /> Salvar Pixel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleVerify}
              disabled={verify === "loading" || !savedSnapshot.metaPixelEnabled}
            >
              {verify === "loading" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Verificar instalação
            </Button>
            {verify === "found" && (
              <span className="text-success flex items-center gap-1 text-xs">
                <CheckCircle2 className="size-3.5" /> Pixel encontrado na página publicada
              </span>
            )}
            {verify === "missing" && (
              <span className="text-warning-foreground dark:text-warning flex items-center gap-1 text-xs">
                <AlertTriangle className="size-3.5" /> Pixel não encontrado — salve e publique o produto
              </span>
            )}
            {verify === "error" && (
              <span className="text-destructive text-xs">Não foi possível verificar agora.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Código completo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Código completo</CardTitle>
          <CardDescription>
            Código real da landing page publicada deste produto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RenderedCodeViewer
            productId={productId}
            productSlug={productSlug}
            publicUrl={publicUrl}
          />
        </CardContent>
      </Card>

      {/* Códigos personalizados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Código personalizado</CardTitle>
          <CardDescription>
            Aplicado somente na landing page deste produto — nunca em outros
            produtos. HTML solto é injetado o mais cedo possível no corpo da
            página (o App Router não permite que uma página injete conteúdo
            bruto dentro do <code>&lt;head&gt;</code> real; scripts continuam
            funcionando normalmente em qualquer posição).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="head">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="head">&lt;head&gt;</TabsTrigger>
              <TabsTrigger value="body-start">Início do body</TabsTrigger>
              <TabsTrigger value="body-end">Final do body</TabsTrigger>
              <TabsTrigger value="css">CSS</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="head" className="mt-3">
              <CodeEditor
                language="html"
                value={form.customHeadCode}
                onChange={(v) => setField("customHeadCode", v)}
                onSave={triggerSave}
              />
            </TabsContent>
            <TabsContent value="body-start" className="mt-3">
              <CodeEditor
                language="html"
                value={form.customBodyStartCode}
                onChange={(v) => setField("customBodyStartCode", v)}
                onSave={triggerSave}
              />
            </TabsContent>
            <TabsContent value="body-end" className="mt-3">
              <CodeEditor
                language="html"
                value={form.customBodyEndCode}
                onChange={(v) => setField("customBodyEndCode", v)}
                onSave={triggerSave}
              />
            </TabsContent>
            <TabsContent value="css" className="mt-3">
              <CodeEditor
                language="css"
                value={form.customCss}
                onChange={(v) => setField("customCss", v)}
                onSave={triggerSave}
              />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeEditor
                language="javascript"
                value={form.customJavaScript}
                onChange={(v) => setField("customJavaScript", v)}
                onSave={triggerSave}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Pré-visualização */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pré-visualização</CardTitle>
          <CardDescription>
            Mostra a versão publicada mais recente, isolada do painel.
          </CardDescription>
          <CardAction>
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Pré-visualizar
              </a>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isPublished ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Landing page ainda não publicada</AlertTitle>
              <AlertDescription>
                Ative o produto em &quot;Dados do produto&quot; para publicar
                a landing page e liberar a pré-visualização.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="inline-flex rounded-md border p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={device === "desktop" ? "secondary" : "ghost"}
                  onClick={() => setDevice("desktop")}
                >
                  <Monitor /> Desktop
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={device === "mobile" ? "secondary" : "ghost"}
                  onClick={() => setDevice("mobile")}
                >
                  <Smartphone /> Mobile
                </Button>
              </div>
              <div className="bg-muted overflow-auto rounded-md border p-3">
                <iframe
                  key={previewKey}
                  src={publicUrl}
                  title="Pré-visualização da landing page"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  loading="lazy"
                  className={cn(
                    "bg-background mx-auto rounded border shadow-sm",
                    device === "mobile" ? "h-[700px] w-[390px]" : "h-[700px] w-full",
                  )}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
