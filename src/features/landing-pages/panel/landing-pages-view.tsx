"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileEdit,
  ImageOff,
  LayoutGrid,
  Loader2,
  MousePointerClick,
  Pause,
  Pencil,
  Rocket,
  Search,
  ShoppingBag,
  Table2,
  TrendingUp,
  Users,
} from "lucide-react";

import { formatDateTime, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductOption } from "@/features/products/queries";

import type { LandingPageRow } from "../queries";
import {
  DEPLOYMENT_STATUS_LABEL,
  HOSTING_PROVIDER_LABEL,
  resolveLandingPublicUrl,
  type LandingDeployment,
  type LandingStatus,
} from "../types";
import { CreateLandingWizard } from "./create-wizard";
import { CopyUrlButton, LandingPageActions } from "./page-actions";

const STATUS_META: Record<
  LandingStatus,
  {
    label: string;
    variant: "success" | "warning" | "muted" | "info" | "destructive";
  }
> = {
  published: { label: "Publicada", variant: "success" },
  draft: { label: "Rascunho", variant: "muted" },
  paused: { label: "Pausada", variant: "warning" },
  scheduled: { label: "Agendada", variant: "info" },
  error: { label: "Com erro", variant: "destructive" },
};

const PERIODS = [
  { value: "all", label: "Qualquer período" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
] as const;

const selectClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

export function StatusBadge({ status }: { status: LandingStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <Icon className="size-3.5" /> {label}
        </p>
        <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function LandingPagesView({
  pages,
  products,
  appUrl,
}: {
  pages: LandingPageRow[];
  products: ProductOption[];
  appUrl: string;
}) {
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | LandingStatus>(
    "all",
  );
  const [productFilter, setProductFilter] = React.useState("all");
  const [period, setPeriod] =
    React.useState<(typeof PERIODS)[number]["value"]>("all");
  // Limite calculado no momento da escolha, não durante a renderização: ler o
  // relógio no corpo do componente tornaria a lista instável entre renders.
  const [periodCutoff, setPeriodCutoff] = React.useState<number | null>(null);
  const [view, setView] = React.useState<"cards" | "table">("cards");

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const cutoff = periodCutoff === null ? null : new Date(periodCutoff);

    return pages.filter((page) => {
      if (statusFilter !== "all" && page.status !== statusFilter) return false;
      if (productFilter !== "all" && page.productId !== productFilter)
        return false;
      if (cutoff && new Date(page.updatedAt) < cutoff) return false;
      if (!term) return true;
      return (
        page.name.toLowerCase().includes(term) ||
        page.slug.toLowerCase().includes(term) ||
        (page.productName ?? "").toLowerCase().includes(term)
      );
    });
  }, [pages, query, statusFilter, productFilter, periodCutoff]);

  const totals = React.useMemo(() => {
    const sum = (pick: (page: LandingPageRow) => number) =>
      pages.reduce((total, page) => total + pick(page), 0);

    const views = sum((page) => page.metrics.views);
    const purchases = sum((page) => page.metrics.purchases);

    return {
      total: pages.length,
      published: pages.filter((page) => page.status === "published").length,
      draft: pages.filter((page) => page.status === "draft").length,
      views,
      clicks: sum((page) => page.metrics.ctaClicks),
      purchases,
      conversion: views > 0 ? (purchases / views) * 100 : 0,
    };
  }, [pages]);

  // Uma página hospedada fora responde no endereço que o serviço devolveu;
  // as do editor respondem na rota desta aplicação. O cartão, o botão de
  // abrir e o "copiar URL" têm de concordar com isso, senão o lojista copia
  // um endereço que não é o do anúncio.
  const publicUrlOf = (page: LandingPageRow) =>
    resolveLandingPublicUrl(page, appUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Landing pages</h2>
          <p className="text-muted-foreground text-sm">
            Monte páginas de venda, publique num endereço próprio e use nos
            anúncios. Publicar não exige novo deploy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/landing-pages/dominios">Domínios</Link>
          </Button>
          <CreateLandingWizard products={products} appUrl={appUrl} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <SummaryCard
          icon={LayoutGrid}
          label="Páginas"
          value={formatNumber(totals.total)}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Publicadas"
          value={formatNumber(totals.published)}
        />
        <SummaryCard
          icon={FileEdit}
          label="Rascunhos"
          value={formatNumber(totals.draft)}
        />
        <SummaryCard
          icon={Users}
          label="Visualizações"
          value={formatNumber(totals.views)}
        />
        <SummaryCard
          icon={MousePointerClick}
          label="Cliques"
          value={formatNumber(totals.clicks)}
        />
        <SummaryCard
          icon={ShoppingBag}
          label="Conversões"
          value={formatNumber(totals.purchases)}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Taxa de conversão"
          value={`${totals.conversion.toFixed(2)}%`}
          hint="Pedidos pagos ÷ visitas"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, endereço ou produto"
            className="pl-9"
            aria-label="Buscar landing pages"
          />
        </div>

        <select
          className={selectClass}
          value={productFilter}
          onChange={(event) => setProductFilter(event.target.value)}
          aria-label="Filtrar por produto"
        >
          <option value="all">Todos os produtos</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as "all" | LandingStatus)
          }
          aria-label="Filtrar por status"
        >
          <option value="all">Todos os status</option>
          {(Object.keys(STATUS_META) as LandingStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={period}
          onChange={(event) => {
            const value = event.target
              .value as (typeof PERIODS)[number]["value"];
            setPeriod(value);
            setPeriodCutoff(
              value === "all"
                ? null
                : Date.now() - Number(value) * 24 * 60 * 60 * 1000,
            );
          }}
          aria-label="Filtrar por período"
        >
          {PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <div className="flex rounded-md border p-0.5">
          <Button
            size="sm"
            variant={view === "cards" ? "secondary" : "ghost"}
            onClick={() => setView("cards")}
            aria-label="Ver em cartões"
            aria-pressed={view === "cards"}
          >
            <LayoutGrid />
          </Button>
          <Button
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            onClick={() => setView("table")}
            aria-label="Ver em tabela"
            aria-pressed={view === "table"}
          >
            <Table2 />
          </Button>
        </div>
      </div>

      {pages.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="Nenhuma landing page ainda"
          description="Crie a primeira página, escolha um produto do catálogo e publique num endereço pronto para usar nos anúncios."
          className="min-h-[320px]"
          action={<CreateLandingWizard products={products} appUrl={appUrl} />}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nada encontrado"
          description="Ajuste a busca ou os filtros para ver as suas páginas."
          className="min-h-[240px]"
        />
      ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((page) => (
            <PageCard key={page.id} page={page} publicUrl={publicUrlOf(page)} />
          ))}
        </div>
      ) : (
        <PagesTable pages={filtered} appUrl={appUrl} />
      )}
    </div>
  );
}

function PageCard({
  page,
  publicUrl,
}: {
  page: LandingPageRow;
  publicUrl: string;
}) {
  return (
    <Card className="gap-3 overflow-hidden py-0 pb-4">
      <div className="bg-muted relative aspect-[16/9] w-full overflow-hidden border-b">
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs">
          <ImageOff className="size-5" />
          Sem imagem cadastrada
        </div>
        {page.thumbnailUrl ? (
          // A miniatura vem de um endereço arbitrário definido pelo lojista;
          // o next/image exigiria listar cada domínio em next.config.ts.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.thumbnailUrl}
            alt={`Imagem de ${page.productName ?? page.name}`}
            className="bg-muted relative z-10 size-full object-contain p-4"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <StatusBadge status={page.status} />
          {page.hasUnpublishedChanges && page.status === "published" ? (
            <Badge variant="warning">Alterações não publicadas</Badge>
          ) : null}
        </div>
        {page.deployment.provider !== "infinity" ? (
          <div className="absolute top-2 right-2">
            <Badge variant="info">
              <Cloud className="size-3" />
              {HOSTING_PROVIDER_LABEL[page.deployment.provider]}
            </Badge>
          </div>
        ) : null}
      </div>

      <CardContent className="space-y-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/landing-pages/${page.id}`}
              className="block truncate font-semibold hover:underline"
            >
              {page.name}
            </Link>
            <p className="text-muted-foreground truncate text-xs">
              {page.productName ?? "Sem produto vinculado"}
            </p>
          </div>
          <LandingPageActions
            id={page.id}
            slug={page.slug}
            name={page.name}
            status={page.status}
            publicUrl={publicUrl}
            hasUnpublishedChanges={page.hasUnpublishedChanges}
            deployment={page.deployment}
          />
        </div>

        {page.lastError ? (
          <p className="text-destructive flex items-start gap-1.5 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {page.lastError}
          </p>
        ) : null}

        {page.scheduledPublishAt && page.status === "scheduled" ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CalendarClock className="size-3.5" />
            Entra no ar em {formatDateTime(page.scheduledPublishAt, "pt-PT")}
          </p>
        ) : null}

        <code className="bg-muted text-muted-foreground block truncate rounded px-1.5 py-1 font-mono text-[11px]">
          {publicUrl}
        </code>

        <DeploymentLine deployment={page.deployment} />

        <dl className="grid grid-cols-4 gap-2 text-center">
          <Metric label="Visitas" value={page.metrics.views} />
          <Metric label="Cliques" value={page.metrics.ctaClicks} />
          <Metric label="Vendas" value={page.metrics.purchases} />
          <Metric
            label="Conv."
            value={`${page.metrics.conversionRate.toFixed(1)}%`}
          />
        </dl>

        <p className="text-muted-foreground text-xs">
          Atualizada em {formatDateTime(page.updatedAt, "pt-PT")}
          {page.publishedAt
            ? ` · publicada em ${formatDateTime(page.publishedAt, "pt-PT")}`
            : ""}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/landing-pages/${page.id}`}>
              <Pencil /> Editar
            </Link>
          </Button>
          <CopyUrlButton url={publicUrl} variant="outline" />
          {page.status === "published" ? (
            <Button size="sm" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Estado da hospedagem no cartão.
 *
 * Só aparece nas páginas servidas fora: nas do editor não há deploy nenhum a
 * relatar, e uma linha a dizer "sem deploy" em todas as páginas seria ruído.
 */
function DeploymentLine({ deployment }: { deployment: LandingDeployment }) {
  if (deployment.provider === "infinity") return null;

  const tone: Record<string, string> = {
    ready: "text-emerald-600 dark:text-emerald-400",
    failed: "text-destructive",
    preparing: "text-muted-foreground",
    deploying: "text-muted-foreground",
    idle: "text-muted-foreground",
  };

  const Icon =
    deployment.status === "ready"
      ? CheckCircle2
      : deployment.status === "failed"
        ? AlertTriangle
        : Loader2;

  return (
    <p
      className={`flex items-center gap-1.5 text-xs ${tone[deployment.status]}`}
    >
      <Icon
        className={`size-3.5 shrink-0 ${
          deployment.status === "deploying" || deployment.status === "preparing"
            ? "animate-spin"
            : ""
        }`}
      />
      Hospedagem: {HOSTING_PROVIDER_LABEL[deployment.provider]} ·{" "}
      {DEPLOYMENT_STATUS_LABEL[deployment.status]}
      {deployment.updatedAt
        ? ` · ${formatDateTime(deployment.updatedAt, "pt-PT")}`
        : ""}
    </p>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-muted/60 rounded-md py-1.5">
      <dt className="text-muted-foreground text-[10px] uppercase">{label}</dt>
      <dd className="text-sm font-semibold">
        {typeof value === "number" ? formatNumber(value) : value}
      </dd>
    </div>
  );
}

function PagesTable({
  pages,
  appUrl,
}: {
  pages: LandingPageRow[];
  appUrl: string;
}) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Página</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Visitas</TableHead>
              <TableHead className="text-right">Cliques</TableHead>
              <TableHead className="text-right">Vendas</TableHead>
              <TableHead className="text-right">Conv.</TableHead>
              <TableHead>Atualizada</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => {
              const publicUrl = resolveLandingPublicUrl(page, appUrl);
              return (
                <TableRow key={page.id}>
                  <TableCell>
                    <Link
                      href={`/landing-pages/${page.id}`}
                      className="font-medium hover:underline"
                    >
                      {page.name}
                    </Link>
                    <p className="text-muted-foreground truncate font-mono text-xs">
                      {page.deployment.provider === "vercel" &&
                      page.deployment.url
                        ? page.deployment.url.replace(/^https?:\/\//, "")
                        : `/lp/${page.slug}`}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {page.productName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={page.status} />
                      {page.status === "paused" ? (
                        <Pause className="text-muted-foreground size-3.5" />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(page.metrics.views)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(page.metrics.ctaClicks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(page.metrics.purchases)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {page.metrics.conversionRate.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(page.updatedAt, "pt-PT")}
                  </TableCell>
                  <TableCell>
                    <LandingPageActions
                      id={page.id}
                      slug={page.slug}
                      name={page.name}
                      status={page.status}
                      publicUrl={publicUrl}
                      hasUnpublishedChanges={page.hasUnpublishedChanges}
                      deployment={page.deployment}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
