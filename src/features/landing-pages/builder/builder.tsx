"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  Cloud,
  Code2,
  ExternalLink,
  Globe,
  History,
  Layers,
  Loader2,
  Monitor,
  Package,
  Palette,
  Radar,
  Redo2,
  Rocket,
  Search,
  Smartphone,
  Tablet,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DomainRow } from "@/features/domains/queries";
import type { ProductOption } from "@/features/products/queries";
import type { PublicReview } from "@/features/reviews/queries";

import type {
  LandingEventPoint,
  LandingPageDetail,
  LandingSourceRow,
  LandingVersionRow,
} from "../queries";
import type { LandingSnapshot } from "../types";
import { StatusBadge } from "../panel/landing-pages-view";
import { BlockPalette } from "./block-palette";
import { BuilderCanvas, type Viewport } from "./canvas";
import { BlockInspector } from "./inspector";
import { CodePanel, DesignPanel, PixelsPanel, SeoPanel } from "./panels";
import {
  DomainPanel,
  HistoryPanel,
  MetricsPanel,
  ProductPanel,
  PublishPanel,
} from "./manage";
import { useBuilderState } from "./use-builder-state";

const TABS = [
  { id: "conteudo", label: "Conteúdo", icon: Layers },
  { id: "design", label: "Design", icon: Palette },
  { id: "produto", label: "Produto", icon: Package },
  { id: "seo", label: "SEO", icon: Search },
  { id: "pixels", label: "Pixels", icon: Radar },
  { id: "codigo", label: "Código", icon: Code2 },
  { id: "dominio", label: "Domínio", icon: Globe },
  { id: "publicacao", label: "Publicação", icon: Rocket },
  { id: "historico", label: "Histórico", icon: History },
  { id: "metricas", label: "Métricas", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VIEWPORTS: { id: Viewport; label: string; icon: React.ElementType }[] = [
  { id: "desktop", label: "Computador", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Telemóvel", icon: Smartphone },
];

export interface BuilderProps {
  page: LandingPageDetail;
  products: ProductOption[];
  domains: DomainRow[];
  versions: LandingVersionRow[];
  series: LandingEventPoint[];
  sources: LandingSourceRow[];
  reviews: PublicReview[];
  appUrl: string;
  canEditCode: boolean;
}

/**
 * Editor visual de uma landing page.
 *
 * O documento vive em memória e é gravado por autosave; a pré-visualização
 * central usa o mesmo renderer da página pública, então o que se vê aqui é
 * literalmente o que o cliente vai receber.
 */
export function LandingBuilder({
  page,
  products,
  domains,
  versions,
  series,
  sources,
  reviews,
  appUrl,
  canEditCode,
}: BuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId | null) ?? "conteudo";

  const [tab, setTab] = React.useState<TabId>(
    TABS.some((item) => item.id === initialTab) ? initialTab : "conteudo",
  );
  const [viewport, setViewport] = React.useState<Viewport>("desktop");

  const state = useBuilderState(page.id, {
    content: page.content,
    theme: page.theme,
    seo: page.seo,
    tracking: page.tracking,
    customCode: page.customCode,
  });

  // Snapshot ao vivo: o mesmo formato que a página publicada recebe, montado
  // a partir do rascunho em edição.
  const snapshot: LandingSnapshot = React.useMemo(
    () => ({
      version: page.draftVersion,
      publicName: page.publicName || page.name,
      logoUrl: page.logoUrl || null,
      faviconUrl: page.faviconUrl || null,
      language: page.language,
      currency: page.currency,
      content: state.doc.content,
      theme: state.doc.theme,
      seo: state.doc.seo,
      tracking: state.doc.tracking,
      customCode: state.doc.customCode,
      product: page.product,
      publishedAt: new Date().toISOString(),
    }),
    [page, state.doc],
  );

  const publicUrl = `${appUrl}/lp/${page.slug}`;

  // Atalhos de teclado do editor.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        state.undo();
      } else if (
        (event.key.toLowerCase() === "z" && event.shiftKey) ||
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        state.redo();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void state.save();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state]);

  return (
    <div className="-m-4 flex h-[calc(100svh-4rem)] flex-col md:-m-6 md:h-[calc(100svh-4.5rem)]">
      {/* Barra superior */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/landing-pages" aria-label="Voltar para a lista">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{page.name}</p>
            <p className="text-muted-foreground truncate font-mono text-[11px]">
              /lp/{page.slug}
            </p>
          </div>
          <StatusBadge status={page.status} />
          {page.hasUnpublishedChanges && page.publishedVersion ? (
            <Badge variant="warning" className="hidden sm:inline-flex">
              Alterações por publicar
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <SaveIndicator state={state.saveState} error={state.saveError} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={state.undo}
                disabled={!state.canUndo}
                aria-label="Desfazer"
              >
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Desfazer (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={state.redo}
                disabled={!state.canRedo}
                aria-label="Refazer"
              >
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refazer (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>

          {page.status === "published" ? (
            <Button size="sm" variant="outline" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Ver no ar
              </a>
            </Button>
          ) : null}

          <Button
            size="sm"
            onClick={async () => {
              await state.save();
              setTab("publicacao");
              router.refresh();
            }}
          >
            <Rocket /> Publicar
          </Button>
        </div>
      </header>

      {/* Abas */}
      <nav className="flex gap-1 overflow-x-auto border-b px-3 py-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === item.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "conteudo" ? (
          <div className="flex h-full">
            <aside className="hidden w-64 shrink-0 border-r lg:block">
              <BlockPalette
                onAdd={(type) => state.addBlock(type)}
                hasProduct={Boolean(page.product)}
              />
            </aside>

            <main className="min-w-0 flex-1 overflow-y-auto bg-muted/40">
              <div className="sticky top-0 z-10 flex items-center justify-center gap-1 border-b bg-background/90 px-3 py-2 backdrop-blur">
                {VIEWPORTS.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={viewport === item.id ? "secondary" : "ghost"}
                    onClick={() => setViewport(item.id)}
                    aria-label={item.label}
                    aria-pressed={viewport === item.id}
                  >
                    <item.icon />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                ))}
              </div>

              <div className="p-4">
                <BuilderCanvas
                  state={state}
                  snapshot={snapshot}
                  reviews={reviews}
                  pageId={page.id}
                  viewport={viewport}
                />
              </div>
            </main>

            <aside className="hidden w-80 shrink-0 border-l xl:block">
              <BlockInspector state={state} />
            </aside>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {tab === "design" ? <DesignPanel state={state} /> : null}
            {tab === "produto" ? (
              <ProductPanel page={page} products={products} appUrl={appUrl} />
            ) : null}
            {tab === "seo" ? (
              <SeoPanel state={state} publicUrl={publicUrl} />
            ) : null}
            {tab === "pixels" ? <PixelsPanel state={state} /> : null}
            {tab === "codigo" ? (
              <CodePanel state={state} canEditCode={canEditCode} />
            ) : null}
            {tab === "dominio" ? (
              <DomainPanel page={page} domains={domains} appUrl={appUrl} />
            ) : null}
            {tab === "publicacao" ? (
              <PublishPanel page={page} state={state} appUrl={appUrl} />
            ) : null}
            {tab === "historico" ? (
              <HistoryPanel page={page} versions={versions} />
            ) : null}
            {tab === "metricas" ? (
              <MetricsPanel page={page} series={series} sources={sources} />
            ) : null}
          </div>
        )}
      </div>

      {/* Inspetor em ecrãs estreitos, abaixo do canvas */}
      {tab === "conteudo" ? (
        <div className="max-h-64 overflow-y-auto border-t xl:hidden">
          <BlockInspector state={state} />
        </div>
      ) : null}
    </div>
  );
}

function SaveIndicator({
  state,
  error,
}: {
  state: "idle" | "saving" | "saved" | "error";
  error: string;
}) {
  if (state === "saving") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" /> Salvando…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1.5 px-2 text-xs text-emerald-600">
        <Check className="size-3.5" /> Salvo
      </span>
    );
  }
  if (state === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-destructive flex items-center gap-1.5 px-2 text-xs">
            <AlertCircle className="size-3.5" /> Erro ao salvar
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {error || "Não foi possível salvar."}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className="text-muted-foreground hidden items-center gap-1.5 px-2 text-xs sm:flex">
      <Cloud className="size-3.5" /> Autosave ativo
    </span>
  );
}
