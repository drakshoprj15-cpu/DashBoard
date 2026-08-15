"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  QrCode,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { ShareDialog } from "@/features/payment-links/share-dialog";
import {
  archivePaymentLinkAction,
  deletePaymentLinkAction,
  duplicatePaymentLinkAction,
  togglePaymentLinkAction,
} from "@/features/payment-links/actions";
import {
  PERIOD_OPTIONS,
  STATE_LABEL,
  type PaymentLinkListItem,
  type PaymentLinkMetrics,
} from "@/features/payment-links/types";

/**
 * Central de links de pagamento.
 *
 * Métricas e lista chegam prontas do servidor; o que roda aqui é a
 * interação — busca, filtros, ordenação e as ações de cada link.
 */

type FilterValue =
  "all" | "active" | "paid" | "unpaid" | "disabled" | "expired";

type SortValue = "recent" | "oldest" | "revenue" | "views";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "paid", label: "Pagos" },
  { value: "unpaid", label: "Sem pagamento" },
  { value: "disabled", label: "Desativados" },
  { value: "expired", label: "Expirados" },
];

function MetricCard({
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
        <div className="flex items-center gap-2">
          <Icon className="text-muted-foreground size-3.5" aria-hidden="true" />
          <span className="text-muted-foreground text-xs font-medium">
            {label}
          </span>
        </div>
        <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LinkRow({
  link,
  onShare,
  onChanged,
}: {
  link: PaymentLinkListItem;
  onShare: (link: PaymentLinkListItem) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const state = STATE_LABEL[link.state];

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  }

  async function run(
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) {
    setBusy(true);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "Feito");
        onChanged();
      } else {
        toast.error(result.error ?? "Não foi possível concluir a ação");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr
        className={cn(
          "border-b transition-colors hover:bg-muted/30",
          busy && "opacity-60",
        )}
      >
        <td className="min-w-[220px] px-4 py-3">
          <p className="truncate text-sm font-semibold">{link.name}</p>
          <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
            /{link.slug}
          </p>
        </td>
        <td className="hidden max-w-[180px] px-3 py-3 text-xs lg:table-cell">
          <span className="block truncate font-mono">
            {link.domainHostname ?? "Infinity"}
          </span>
        </td>
        <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums">
          {formatMoney(link.amountCents, link.currency, "pt-PT")}
        </td>
        <td className="hidden px-3 py-3 text-right text-sm tabular-nums md:table-cell">
          {formatNumber(link.paymentsPaid, "pt-PT")}
        </td>
        <td className="hidden px-3 py-3 text-right text-sm font-medium tabular-nums xl:table-cell">
          {formatMoney(link.revenueCents, link.currency, "pt-PT")}
        </td>
        <td className="hidden px-3 py-3 text-right text-sm tabular-nums xl:table-cell">
          {(link.conversionRate * 100).toFixed(1).replace(".", ",")}%
        </td>
        <td className="px-3 py-3">
          <Badge
            variant={
              state.tone === "success"
                ? "success"
                : state.tone === "warning"
                  ? "warning"
                  : "muted"
            }
          >
            {state.label}
          </Badge>
        </td>
        <td className="hidden px-3 py-3 text-xs 2xl:table-cell">
          {formatDate(link.createdAt, "pt-PT")}
        </td>
        <td className="hidden px-3 py-3 text-xs 2xl:table-cell">
          {link.lastSaleAt ? formatDate(link.lastSaleAt, "pt-PT") : "—"}
        </td>
        <td className="px-3 py-3 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`Ações de ${link.name}`}
                className="size-8"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onSelect={() =>
                  window.open(link.url, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="size-3.5" />
                Abrir
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  router.push(`/financeiro/links-de-pagamento/${link.id}`)
                }
              >
                <Pencil className="size-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copy()}>
                <Copy className="size-3.5" />
                {copied ? "Link copiado" : "Copiar link"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShare(link)}>
                <QrCode className="size-3.5" />
                Copiar como QR Code
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => run(() => duplicatePaymentLinkAction(link.id))}
              >
                Duplicar
              </DropdownMenuItem>
              {link.state !== "draft" ? (
                <DropdownMenuItem
                  onSelect={() =>
                    run(() => togglePaymentLinkAction(link.id, !link.isActive))
                  }
                >
                  <Power className="size-3.5" />
                  {link.isActive ? "Pausar" : "Reativar"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link
                  href={`/financeiro/links-de-pagamento/${link.id}/pagamentos`}
                >
                  Ver pagamentos
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  run(() =>
                    archivePaymentLinkAction(
                      link.id,
                      link.state !== "archived",
                    ),
                  )
                }
              >
                {link.state === "archived" ? "Restaurar" : "Arquivar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir link?</DialogTitle>
            <DialogDescription>
              &quot;{link.name}&quot; deixará de funcionar imediatamente. Links
              com pagamentos confirmados não podem ser excluídos — arquive-os.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmDelete(false);
                await run(() => deletePaymentLinkAction(link.id));
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface LinksViewProps {
  links: PaymentLinkListItem[];
  metrics: PaymentLinkMetrics;
  period: string;
}

export function LinksView({ links, metrics, period }: LinksViewProps) {
  const router = useRouter();
  const [rawSearch, setRawSearch] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterValue>("all");
  const [sort, setSort] = React.useState<SortValue>("recent");
  const [sharing, setSharing] = React.useState<PaymentLinkListItem | null>(
    null,
  );

  // Busca com debounce: filtrar a cada tecla numa lista grande trava a UI.
  React.useEffect(() => {
    const timer = setTimeout(
      () => setSearch(rawSearch.trim().toLowerCase()),
      200,
    );
    return () => clearTimeout(timer);
  }, [rawSearch]);

  const visible = React.useMemo(() => {
    const matchesFilter = (link: PaymentLinkListItem) => {
      switch (filter) {
        case "active":
          return link.state === "active";
        case "paid":
          return link.paymentsPaid > 0;
        case "unpaid":
          return link.paymentsPaid === 0;
        case "disabled":
          return link.state === "paused" || link.state === "archived";
        case "expired":
          return link.state === "expired" || link.state === "exhausted";
        default:
          return true;
      }
    };

    const matchesSearch = (link: PaymentLinkListItem) =>
      !search ||
      [
        link.name,
        link.title,
        link.url,
        link.slug,
        link.productName,
        link.domainHostname,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search));

    const sorted = links.filter((l) => matchesFilter(l) && matchesSearch(l));

    return sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "revenue":
          return b.revenueCents - a.revenueCents;
        case "views":
          return b.views - a.views;
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [links, filter, search, sort]);

  function changePeriod(value: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("periodo", value);
    router.push(`/financeiro/links-de-pagamento?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground mb-1 text-xs">
            Financeiro / Link de pagamento
          </p>
          <h2 className="text-xl font-bold tracking-tight">
            Links de pagamento
          </h2>
          <p className="text-muted-foreground text-sm">
            Crie páginas de pagamento personalizadas e receba através dos meios
            disponíveis no seu processador.
          </p>
        </div>
        <Button asChild>
          <Link href="/financeiro/links-de-pagamento/novo">
            <Plus className="size-4" />
            Criar link
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={period === option.value ? "secondary" : "ghost"}
            onClick={() => changePeriod(option.value)}
            className="h-7 px-2.5 text-xs"
          >
            {option.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={period === "all" ? "secondary" : "ghost"}
          onClick={() => changePeriod("all")}
          className="h-7 px-2.5 text-xs"
        >
          Tudo
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Link2}
          label="Links ativos"
          value={formatNumber(metrics.activeLinks, "pt-PT")}
        />
        <MetricCard
          icon={CreditCard}
          label="Pagamentos"
          value={formatNumber(metrics.paidPayments, "pt-PT")}
        />
        <MetricCard
          icon={TrendingUp}
          label="Conversão"
          value={`${(metrics.conversionRate * 100).toFixed(1).replace(".", ",")}%`}
          hint={`${formatNumber(metrics.views, "pt-PT")} acessos`}
        />
        <MetricCard
          icon={Wallet}
          label="Receita"
          value={formatMoney(metrics.revenueCents, metrics.currency, "pt-PT")}
          hint={`Ticket médio ${formatMoney(metrics.averageTicketCents, metrics.currency, "pt-PT")}`}
        />
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhum link criado ainda"
          description="Crie seu primeiro link de pagamento e comece a receber pagamentos."
          action={
            <Button asChild>
              <Link href="/financeiro/links-de-pagamento/novo">
                <Plus className="size-4" />
                Criar primeiro link
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                  placeholder="Buscar links"
                  aria-label="Buscar links por nome, endereço, produto ou domínio"
                  className="h-9 pl-9"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortValue)}
                aria-label="Ordenação"
                className="border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                <option value="recent">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="revenue">Maior receita</option>
                <option value="views">Mais acessados</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={filter === option.value ? "secondary" : "ghost"}
                  onClick={() => setFilter(option.value)}
                  className="h-7 px-2.5 text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Nenhum link corresponde à busca.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">
                    Links de pagamento e resultados
                  </caption>
                  <thead className="bg-muted/50 text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5">Nome / slug</th>
                      <th className="hidden px-3 py-2.5 lg:table-cell">
                        Domínio
                      </th>
                      <th className="px-3 py-2.5 text-right">Valor</th>
                      <th className="hidden px-3 py-2.5 text-right md:table-cell">
                        Pagamentos
                      </th>
                      <th className="hidden px-3 py-2.5 text-right xl:table-cell">
                        Receita
                      </th>
                      <th className="hidden px-3 py-2.5 text-right xl:table-cell">
                        Conversão
                      </th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="hidden px-3 py-2.5 2xl:table-cell">
                        Criado
                      </th>
                      <th className="hidden px-3 py-2.5 2xl:table-cell">
                        Última venda
                      </th>
                      <th className="w-12 px-3 py-2.5">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((link) => (
                      <LinkRow
                        key={link.id}
                        link={link}
                        onShare={setSharing}
                        onChanged={() => router.refresh()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ShareDialog
        open={sharing !== null}
        onOpenChange={(open) => !open && setSharing(null)}
        url={sharing?.url ?? ""}
        title={sharing?.name}
      />
    </div>
  );
}
