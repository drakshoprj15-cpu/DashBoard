"use client";

import * as React from "react";
import { AlertTriangle, Check, Copy, Info, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  BUTTON_STYLE_OPTIONS,
  FONT_OPTIONS,
  SHADOW_OPTIONS,
} from "../defaults";
import { analyzeCodeRisks } from "../sanitize";
import type { LandingTheme } from "../types";
import type { BuilderState } from "./use-builder-state";

const selectClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";
const textareaClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px]";

function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-b p-5 last:border-b-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ThemeColor({
  label,
  field,
  state,
}: {
  label: string;
  field: keyof LandingTheme;
  state: BuilderState;
}) {
  const value = String(state.doc.theme[field] ?? "");
  const id = `theme-${String(field)}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => state.setTheme({ [field]: event.target.value })}
          className="size-9 shrink-0 cursor-pointer rounded border"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(event) => state.setTheme({ [field]: event.target.value })}
          className="font-mono text-xs uppercase"
        />
      </div>
    </div>
  );
}

export function DesignPanel({ state }: { state: BuilderState }) {
  const theme = state.doc.theme;

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Cores"
        description="Aplicadas a toda a página. A prévia atualiza enquanto escolhe."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ThemeColor
            label="Cor principal"
            field="primaryColor"
            state={state}
          />
          <ThemeColor
            label="Cor secundária"
            field="secondaryColor"
            state={state}
          />
          <ThemeColor
            label="Fundo da página"
            field="backgroundColor"
            state={state}
          />
          <ThemeColor label="Texto" field="textColor" state={state} />
          <ThemeColor
            label="Fundo dos botões"
            field="buttonColor"
            state={state}
          />
          <ThemeColor
            label="Texto dos botões"
            field="buttonTextColor"
            state={state}
          />
          <ThemeColor
            label="Variação selecionada"
            field="variantSelectedColor"
            state={state}
          />
        </div>
      </PanelSection>

      <PanelSection title="Tipografia">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="heading-font">Fonte dos títulos</Label>
            <select
              id="heading-font"
              className={selectClass}
              value={theme.headingFont}
              onChange={(event) =>
                state.setTheme({ headingFont: event.target.value })
              }
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body-font">Fonte dos textos</Label>
            <select
              id="body-font"
              className={selectClass}
              value={theme.bodyFont}
              onChange={(event) =>
                state.setTheme({ bodyFont: event.target.value })
              }
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Forma e espaço">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="radius">Arredondamento: {theme.radius}px</Label>
            <input
              id="radius"
              type="range"
              min={0}
              max={32}
              value={theme.radius}
              onChange={(event) =>
                state.setTheme({ radius: Number(event.target.value) })
              }
              className="accent-primary w-full"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max-width">
              Largura máxima: {theme.maxWidth}px
            </Label>
            <input
              id="max-width"
              type="range"
              min={600}
              max={1600}
              step={20}
              value={theme.maxWidth}
              onChange={(event) =>
                state.setTheme({ maxWidth: Number(event.target.value) })
              }
              className="accent-primary w-full"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shadow">Sombras</Label>
            <select
              id="shadow"
              className={selectClass}
              value={theme.shadow}
              onChange={(event) =>
                state.setTheme({
                  shadow: event.target.value as LandingTheme["shadow"],
                })
              }
            >
              {SHADOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="button-style">Estilo dos botões</Label>
            <select
              id="button-style"
              className={selectClass}
              value={theme.buttonStyle}
              onChange={(event) =>
                state.setTheme({
                  buttonStyle: event.target
                    .value as LandingTheme["buttonStyle"],
                })
              }
            >
              {BUTTON_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="color-scheme">Tema escuro</Label>
            <p className="text-muted-foreground text-xs">
              Ajusta bordas, superfícies e textos secundários para fundo escuro.
            </p>
          </div>
          <Switch
            id="color-scheme"
            checked={theme.colorScheme === "dark"}
            onCheckedChange={(checked) =>
              state.setTheme({ colorScheme: checked ? "dark" : "light" })
            }
          />
        </div>
      </PanelSection>
    </div>
  );
}

export function SeoPanel({
  state,
  publicUrl,
}: {
  state: BuilderState;
  publicUrl: string;
}) {
  const seo = state.doc.seo;

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Resultado nos buscadores"
        description="Como a página aparece no Google e ao ser partilhada."
      >
        <div className="space-y-1.5">
          <Label htmlFor="seo-title">Título SEO</Label>
          <Input
            id="seo-title"
            value={seo.title}
            maxLength={120}
            onChange={(event) => state.setSeo({ title: event.target.value })}
          />
          <p className="text-muted-foreground text-xs">
            {seo.title.length}/60 caracteres recomendados.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seo-description">Meta descrição</Label>
          <textarea
            id="seo-description"
            value={seo.description}
            maxLength={320}
            onChange={(event) =>
              state.setSeo({ description: event.target.value })
            }
            className={`${textareaClass} min-h-20 font-sans text-sm`}
          />
          <p className="text-muted-foreground text-xs">
            {seo.description.length}/155 caracteres recomendados.
          </p>
        </div>

        {/* Prévia fiel do resultado de busca */}
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">Prévia</p>
          <p className="mt-1 truncate text-sm text-emerald-700 dark:text-emerald-400">
            {publicUrl}
          </p>
          <p className="truncate text-lg text-blue-700 dark:text-blue-400">
            {seo.title || "Título da página"}
          </p>
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {seo.description || "A meta descrição aparece aqui."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seo-keywords">Palavras-chave</Label>
          <Input
            id="seo-keywords"
            value={seo.keywords}
            placeholder="separadas, por, vírgula"
            onChange={(event) => state.setSeo({ keywords: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seo-canonical">URL canónica</Label>
          <Input
            id="seo-canonical"
            value={seo.canonicalUrl}
            placeholder={publicUrl}
            onChange={(event) =>
              state.setSeo({ canonicalUrl: event.target.value })
            }
          />
          <p className="text-muted-foreground text-xs">
            Vazio = usa o próprio endereço da página.
          </p>
        </div>
      </PanelSection>

      <PanelSection title="Partilha em redes sociais">
        <div className="space-y-1.5">
          <Label htmlFor="seo-share-image">Imagem de partilha</Label>
          <Input
            id="seo-share-image"
            value={seo.shareImageUrl}
            placeholder="https://… (1200×630 px)"
            onChange={(event) =>
              state.setSeo({ shareImageUrl: event.target.value })
            }
          />
          <p className="text-muted-foreground text-xs">
            Vazio = usa a imagem principal do produto.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seo-twitter">Formato do cartão (X/Twitter)</Label>
          <select
            id="seo-twitter"
            className={selectClass}
            value={seo.twitterCard}
            onChange={(event) =>
              state.setSeo({
                twitterCard: event.target.value as
                  "summary" | "summary_large_image",
              })
            }
          >
            <option value="summary_large_image">Imagem grande</option>
            <option value="summary">Resumo</option>
          </select>
        </div>
      </PanelSection>

      <PanelSection title="Indexação">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="seo-noindex">Não indexar esta página</Label>
            <p className="text-muted-foreground text-xs">
              Aplica <code>robots: noindex</code> — a página sai dos resultados
              de busca, mas continua acessível pelo link.
            </p>
          </div>
          <Switch
            id="seo-noindex"
            checked={seo.noIndex}
            onCheckedChange={(checked) => state.setSeo({ noIndex: checked })}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="seo-schema">Dados estruturados de produto</Label>
            <p className="text-muted-foreground text-xs">
              Publica preço e disponibilidade em Schema.org/Product, a partir do
              produto vinculado.
            </p>
          </div>
          <Switch
            id="seo-schema"
            checked={seo.productSchema}
            onCheckedChange={(checked) =>
              state.setSeo({ productSchema: checked })
            }
          />
        </div>
      </PanelSection>
    </div>
  );
}

export function PixelsPanel({ state }: { state: BuilderState }) {
  const tracking = state.doc.tracking;

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Pixels desta página"
        description="Somam-se aos pixels globais configurados em Pixel. Todos respeitam o consentimento de cookies."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meta-pixel">Meta Pixel</Label>
            <Input
              id="meta-pixel"
              value={tracking.metaPixelId}
              placeholder="15 ou 16 dígitos"
              inputMode="numeric"
              onChange={(event) =>
                state.setTracking({ metaPixelId: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ga4">Google Analytics 4</Label>
            <Input
              id="ga4"
              value={tracking.ga4MeasurementId}
              placeholder="G-XXXXXXXXXX"
              onChange={(event) =>
                state.setTracking({ ga4MeasurementId: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gtm">Google Tag Manager</Label>
            <Input
              id="gtm"
              value={tracking.gtmContainerId}
              placeholder="GTM-XXXXXXX"
              onChange={(event) =>
                state.setTracking({ gtmContainerId: event.target.value })
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="inherit-pixels">
              Herdar os pixels do workspace
            </Label>
            <p className="text-muted-foreground text-xs">
              Mantém os pixels globais a funcionar nesta página, além dos acima.
            </p>
          </div>
          <Switch
            id="inherit-pixels"
            checked={tracking.inheritWorkspacePixels}
            onCheckedChange={(checked) =>
              state.setTracking({ inheritWorkspacePixels: checked })
            }
          />
        </div>

        <Alert>
          <Info />
          <AlertDescription>
            O evento <strong>Purchase</strong> nunca é disparado pelo navegador:
            é enviado pelo servidor depois de o gateway confirmar o pagamento,
            evitando contagem duplicada e vendas fantasma.
          </AlertDescription>
        </Alert>
      </PanelSection>

      <PanelSection
        title="Parâmetros de campanha"
        description="Acrescentados ao link do checkout quando o anúncio não trouxer os seus."
      >
        <div className="space-y-1.5">
          <Label htmlFor="default-utm">Parâmetros padrão</Label>
          <Input
            id="default-utm"
            value={tracking.defaultUtm}
            placeholder="utm_source=meta&utm_medium=cpc"
            onChange={(event) =>
              state.setTracking({ defaultUtm: event.target.value })
            }
          />
          <p className="text-muted-foreground text-xs">
            O que vier na URL do anúncio tem sempre prioridade. As UTMs,
            <code> fbclid</code> e <code>gclid</code> da visita são preservados
            automaticamente até ao checkout.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}

export function CodePanel({
  state,
  canEditCode,
}: {
  state: BuilderState;
  canEditCode: boolean;
}) {
  const code = state.doc.customCode;
  const risks = React.useMemo(() => analyzeCodeRisks(code), [code]);

  function copy(value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success("Código copiado."))
      .catch(() => toast.error("O navegador bloqueou a cópia."));
  }

  const fields = [
    {
      key: "headCode" as const,
      label: "Código no <head>",
      help: "Meta tags de verificação, pré-conexões, fontes.",
    },
    {
      key: "bodyStartCode" as const,
      label: "Após a abertura do <body>",
      help: "Ex.: noscript do Google Tag Manager.",
    },
    {
      key: "bodyEndCode" as const,
      label: "Antes do fecho do </body>",
      help: "Widgets de chat e scripts que podem carregar por último.",
    },
  ];

  if (!canEditCode) {
    return (
      <div className="mx-auto max-w-3xl p-5">
        <Alert>
          <ShieldAlert />
          <AlertDescription>
            Só utilizadores autenticados podem inserir código personalizado.
            Entre com a sua conta para editar esta aba.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Código personalizado"
        description="Executa apenas na página pública. O painel nunca avalia este código."
      >
        {risks.length > 0 ? (
          <div className="space-y-2">
            {risks.map((risk, index) => (
              <Alert
                key={index}
                variant={risk.level === "warning" ? "destructive" : "default"}
              >
                {risk.level === "warning" ? <AlertTriangle /> : <Info />}
                <AlertDescription>{risk.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        ) : null}

        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => copy(code[field.key])}
              >
                <Copy /> Copiar
              </Button>
            </div>
            <textarea
              id={field.key}
              value={code[field.key]}
              spellCheck={false}
              onChange={(event) =>
                state.setCustomCode({ [field.key]: event.target.value })
              }
              className={`${textareaClass} min-h-32`}
            />
            <p className="text-muted-foreground text-xs">{field.help}</p>
          </div>
        ))}
      </PanelSection>

      <PanelSection title="CSS personalizado">
        <textarea
          id="custom-css"
          value={code.css}
          spellCheck={false}
          onChange={(event) => state.setCustomCode({ css: event.target.value })}
          className={`${textareaClass} min-h-40`}
          aria-label="CSS personalizado"
        />
        <p className="text-muted-foreground text-xs">
          <code>@import</code> e truques antigos de execução (
          <code>expression()</code>, <code>behavior</code>) são removidos ao
          gravar.
        </p>
      </PanelSection>

      <PanelSection title="JavaScript personalizado">
        <textarea
          id="custom-js"
          value={code.javascript}
          spellCheck={false}
          onChange={(event) =>
            state.setCustomCode({ javascript: event.target.value })
          }
          className={`${textareaClass} min-h-40`}
          aria-label="JavaScript personalizado"
        />
        <p className="text-muted-foreground text-xs">
          Carregado com <code>afterInteractive</code>, depois do conteúdo — não
          atrasa a primeira pintura.
        </p>
      </PanelSection>

      <PanelSection
        title="Conteúdo estruturado da página"
        description="O documento que fica gravado. Útil para copiar entre páginas ou guardar fora."
      >
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copy(JSON.stringify(state.doc, null, 2))}
          >
            <Copy /> Copiar JSON
          </Button>
        </div>
        <pre className="bg-muted max-h-72 overflow-auto rounded-lg p-3 text-[11px] leading-relaxed">
          {JSON.stringify(state.doc.content, null, 2)}
        </pre>
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          Cada publicação guarda uma cópia imutável deste documento no histórico
          de versões.
        </p>
      </PanelSection>
    </div>
  );
}
