"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  BadgeCheck,
  BellRing,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Mail,
  Megaphone,
  Percent,
  RefreshCw,
  ShoppingCart,
  Send,
  TrendingUp,
  Upload,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import {
  CART_TABS,
  ORDER_STATUS_LABEL,
  type CartTab,
} from "@/features/carts/status";
import type {
  CartListResponseDTO,
  CartRowDTO,
  PendingReminderCandidatesDTO,
} from "@/features/carts/client-types";
import {
  archiveCartsAction,
  bulkSendReminderAction,
  cancelCartOrderAction,
  logWhatsAppReminderAction,
  markCartStatusAction,
} from "@/features/carts/actions";
import {
  CartFilters,
  EMPTY_CART_FILTERS,
  SORT_OPTIONS,
  type CartFiltersState,
} from "@/features/carts/cart-filters";
import { CartsTable } from "@/features/carts/carts-table";
import { CartDetailSheet } from "@/features/carts/cart-detail-sheet";
import {
  ReminderDialog,
  type ReminderChannel,
} from "@/features/carts/reminder-dialog";
import { ImportDialog } from "@/features/carts/import-dialog";
import { CancelOrderDialog } from "@/features/carts/cancel-order-dialog";
import { buildWhatsAppMessage } from "@/features/carts/cart-recovery-actions";
import { whatsAppUrl } from "@/features/carts/phone";
import type { CartTemplateKey } from "@/features/carts/templates";
import type { ProductOption } from "@/features/products/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_SORT = "createdAt:desc";

type MarkAction = "recovered" | "refused" | "pending";

interface ReminderTarget {
  rows: CartRowDTO[];
  matchedTotal?: number;
}

function isCartTab(value: string | null): value is CartTab {
  return value !== null && CART_TABS.some((t) => t.key === value);
}

export function CarrinhosView({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: CartTab = isCartTab(searchParams.get("status"))
    ? (searchParams.get("status") as CartTab)
    : "all";
  const filters: CartFiltersState = {
    q: searchParams.get("q") ?? "",
    method: searchParams.get("method") ?? "",
    gateway: searchParams.get("gateway") ?? "",
    country: searchParams.get("country") ?? "",
    currency: searchParams.get("currency") ?? "",
    productId: searchParams.get("productId") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    imported: searchParams.get("imported") ?? "",
    archived: searchParams.get("archived") ?? "",
  };
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize =
    Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) ||
    DEFAULT_PAGE_SIZE;

  const sortParam = `${searchParams.get("sortBy") ?? "createdAt"}:${searchParams.get("sortDir") ?? "desc"}`;
  const sort = SORT_OPTIONS.some((o) => o.value === sortParam)
    ? sortParam
    : DEFAULT_SORT;
  const [sortBy, sortDir] = sort.split(":") as [
    "createdAt" | "totalCents" | "lastReminderSentAt",
    "asc" | "desc",
  ];

  const hasActiveFilters =
    Object.entries(filters).some(([, value]) => Boolean(value)) ||
    tab !== "all";

  const updateParams = React.useCallback(
    (
      patch: Record<string, string | number | undefined>,
      opts?: { resetPage?: boolean },
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      if (opts?.resetPage !== false) params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  /** Query string enviada à API — também reaproveitada no export por filtro. */
  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (tab !== "all") params.set("status", tab);
    if (filters.method) params.set("method", filters.method);
    if (filters.gateway) params.set("gateway", filters.gateway);
    if (filters.country) params.set("country", filters.country);
    if (filters.currency) params.set("currency", filters.currency);
    if (filters.productId) params.set("productId", filters.productId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.imported) params.set("imported", filters.imported);
    if (filters.archived) params.set("archived", filters.archived);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    return params.toString();
  }, [
    filters.q,
    filters.method,
    filters.gateway,
    filters.country,
    filters.currency,
    filters.productId,
    filters.from,
    filters.to,
    filters.imported,
    filters.archived,
    tab,
    page,
    pageSize,
    sortBy,
    sortDir,
  ]);

  const [listData, setListData] = React.useState<CartListResponseDTO | null>(
    null,
  );
  const [status, setStatus] = React.useState<"loading" | "success" | "error">(
    "loading",
  );
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | null>(null);

  // Contador: incrementar força o efeito abaixo a rebuscar mesmo com o
  // mesmo queryString (usado pelo botão "Atualizar dados" e após mutações).
  const [refetchToken, setRefetchToken] = React.useState(0);
  const fetchData = React.useCallback(() => setRefetchToken((t) => t + 1), []);

  React.useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function run() {
      setStatus("loading");
      try {
        const res = await fetch(`/api/carrinhos?${queryString}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as CartListResponseDTO;
        if (!active) return;
        setListData(json);
        setStatus("success");
        setLastSyncedAt(new Date());
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      }
    }

    run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryString, refetchToken]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [prevQueryString, setPrevQueryString] = React.useState(queryString);
  if (queryString !== prevQueryString) {
    setPrevQueryString(queryString);
    setSelected(new Set());
  }

  const [infoOpen, setInfoOpen] = React.useState(false);
  const [detailOrderId, setDetailOrderId] = React.useState<string | null>(null);
  const [detailRefreshToken, setDetailRefreshToken] = React.useState(0);
  const [syncingIds, setSyncingIds] = React.useState<Set<string>>(new Set());
  const [reminderTarget, setReminderTarget] =
    React.useState<ReminderTarget | null>(null);
  const [sending, setSending] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState<string | null>(null);
  const [cancelSending, setCancelSending] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | undefined>();

  const rows = React.useMemo(() => listData?.rows ?? [], [listData]);
  const rowById = React.useMemo(
    () => new Map(rows.map((r) => [r.orderId, r])),
    [rows],
  );

  /**
   * Ids do disparo em massa vindo do filtro. Separado de `reminderTarget`,
   * que só carrega as linhas conhecidas da página atual para montar a
   * pré-visualização — o envio real pode abranger muito mais que isso.
   */
  const pendingIdsRef = React.useRef<string[] | null>(null);

  function afterMutation() {
    fetchData();
    setDetailRefreshToken((t) => t + 1);
  }

  async function handleSync(orderId: string) {
    setSyncingIds((prev) => new Set(prev).add(orderId));
    try {
      const res = await fetch(`/api/carrinhos/${orderId}/sync`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(
          json.message ?? "Não foi possível sincronizar com o gateway.",
        );
      } else {
        toast.success(
          json.orderStatus
            ? `Status sincronizado: ${ORDER_STATUS_LABEL[json.orderStatus] ?? json.orderStatus}`
            : "Sincronizado — sem mudança de status.",
        );
        afterMutation();
      }
    } catch {
      toast.error("Falha ao sincronizar com o gateway.");
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }

  /** Abre a revisão do disparo para um carrinho (tabela, drawer ou menu). */
  function openReminderFor(row: CartRowDTO) {
    setReminderTarget({ rows: [row] });
  }

  function openReminderForId(orderId: string) {
    const row = rowById.get(orderId);
    if (row) openReminderFor(row);
  }

  /**
   * WhatsApp: abre a conversa com a mensagem pronta e regista o evento.
   * `window.open` acontece de forma síncrona no clique — se esperasse a
   * action terminar, o navegador bloquearia o pop-up.
   */
  async function handleOpenWhatsApp(row: CartRowDTO) {
    const url = whatsAppUrl(row.customerPhone, buildWhatsAppMessage(row));
    if (!url) {
      toast.error("Este cliente não tem um telefone válido registado.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");

    const result = await logWhatsAppReminderAction(row.orderId);
    if (result.ok) {
      toast.success("Conversa aberta e lembrete registado no histórico.");
      afterMutation();
    } else {
      toast.warning(result.error ?? "Conversa aberta, mas o registo falhou.");
    }
  }

  function handleOpenWhatsAppById(orderId: string) {
    const row = rowById.get(orderId);
    if (row) void handleOpenWhatsApp(row);
  }

  async function handleMarkStatus(orderId: string, mark: MarkAction) {
    const result = await markCartStatusAction(orderId, mark);
    if (result.ok) {
      toast.success(result.message ?? "Carrinho atualizado.");
      afterMutation();
    } else {
      toast.error(result.error ?? "Não foi possível atualizar o carrinho.");
    }
  }

  async function handleArchive(orderId: string, archived: boolean) {
    const result = await archiveCartsAction([orderId], archived);
    if (result.ok) {
      toast.success(result.message ?? "Carrinho atualizado.");
      afterMutation();
    } else {
      toast.error(result.error ?? "Não foi possível arquivar o carrinho.");
    }
  }

  /** Carrega os candidatos ao disparo em massa a partir dos filtros atuais. */
  async function openPendingReminderDialog() {
    const params = new URLSearchParams(queryString);
    params.delete("status");
    params.delete("page");
    params.delete("pageSize");

    const res = await fetch(`/api/carrinhos/pending?${params.toString()}`);
    if (!res.ok) {
      toast.error("Não foi possível carregar os carrinhos pendentes.");
      return;
    }
    const json: PendingReminderCandidatesDTO = await res.json();
    if (json.orderIds.length === 0) {
      toast.info("Nenhum carrinho pendente encontrado com os filtros atuais.");
      return;
    }

    // Só temos os dados completos dos carrinhos da página atual; os demais
    // entram como alvo apenas pelo id (a pré-visualização usa o primeiro).
    const known = json.orderIds
      .map((id) => rowById.get(id))
      .filter((r): r is CartRowDTO => Boolean(r));
    setReminderTarget({
      rows: known.length > 0 ? known : rows.slice(0, 1),
      matchedTotal: json.matchedTotal,
    });
    pendingIdsRef.current = json.orderIds;
  }

  function openSelectionReminderDialog() {
    if (selected.size === 0) return;
    pendingIdsRef.current = null;
    setReminderTarget({
      rows: Array.from(selected)
        .map((id) => rowById.get(id))
        .filter((r): r is CartRowDTO => Boolean(r)),
    });
  }

  async function confirmReminder(
    channel: ReminderChannel,
    template: CartTemplateKey,
  ) {
    if (!reminderTarget) return;
    const orderIds =
      pendingIdsRef.current ?? reminderTarget.rows.map((r) => r.orderId);

    if (channel === "whatsapp") {
      // WhatsApp é sempre uma conversa de cada vez — o operador confirma cada
      // envio no próprio aplicativo. Abrir N abas de uma vez seria bloqueado
      // pelo navegador e não corresponde ao que realmente acontece.
      const first = reminderTarget.rows[0];
      setReminderTarget(null);
      pendingIdsRef.current = null;
      if (first) await handleOpenWhatsApp(first);
      if (orderIds.length > 1) {
        toast.info("Abra os demais pelo botão de WhatsApp de cada linha.");
      }
      return;
    }

    setSending(true);
    try {
      const result = await bulkSendReminderAction(orderIds, template);
      if (result.sent > 0) {
        toast.success(
          `Lembrete enviado para ${result.sent} ${result.sent === 1 ? "cliente" : "clientes"}.`,
        );
      }
      if (result.skipped > 0) {
        toast.warning(
          `${result.skipped} não receberam${result.errors[0] ? ` (${result.errors[0]})` : ""}.`,
        );
      }
      setReminderTarget(null);
      pendingIdsRef.current = null;
      setSelected(new Set());
      afterMutation();
    } finally {
      setSending(false);
    }
  }

  async function runBulkAction(action: string) {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await fetch("/api/carrinhos/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderIds: Array.from(selected) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "Não foi possível concluir a ação.");
        return;
      }
      const changed = json?.updated ?? json?.message;
      toast.success(
        typeof changed === "number"
          ? `${changed} ${changed === 1 ? "carrinho atualizado" : "carrinhos atualizados"}.`
          : (json?.message ?? "Ação concluída."),
      );
      if (json?.errors?.length) toast.warning(json.errors[0]);
      setSelected(new Set());
      afterMutation();
    } finally {
      setSending(false);
    }
  }

  async function confirmCancel(reason: string) {
    if (!cancelTarget) return;
    setCancelSending(true);
    setCancelError(undefined);
    const result = await cancelCartOrderAction(cancelTarget, reason);
    setCancelSending(false);
    if (result.ok) {
      toast.success(result.message ?? "Pedido cancelado.");
      setCancelTarget(null);
      afterMutation();
    } else {
      setCancelError(result.error);
    }
  }

  /** Export por seleção (`orderIds`) ou por filtro atual (`filters`). */
  async function exportCarts(body: { orderIds?: string[]; filters?: string }) {
    try {
      const res = await fetch("/api/carrinhos/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carrinhos-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída.");
    } catch {
      toast.error("Não foi possível exportar.");
    }
  }

  function createCampaignFromSelection() {
    const ids = new Set<string>();
    for (const orderId of selected) {
      const row = rowById.get(orderId);
      if (row?.customerId) ids.add(row.customerId);
    }
    if (ids.size === 0) {
      toast.error("Nenhum cliente válido nos carrinhos selecionados.");
      return;
    }
    router.push(`/emails?recipients=${Array.from(ids).join(",")}`);
  }

  function toggleSelect(orderId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const allSelected =
        rows.length > 0 && rows.every((r) => prev.has(r.orderId));
      if (allSelected) return new Set();
      return new Set(rows.map((r) => r.orderId));
    });
  }

  const facets = listData?.facets;
  const currency = facets?.dominantCurrency ?? "EUR";
  const money = (cents: number) => formatMoney(cents, currency, "pt-PT");
  const count = (value: number) => formatNumber(value, "pt-PT");

  const cards: {
    label: string;
    value: string;
    sub: string;
    icon: LucideIcon;
  }[] = [
    {
      label: "Carrinhos abandonados",
      value: count(facets?.totals.abandoned.count ?? 0),
      sub: money(facets?.totals.abandoned.valueCents ?? 0),
      icon: ShoppingCart,
    },
    {
      label: "Pagamentos pendentes",
      value: count(facets?.totals.pending.count ?? 0),
      sub: money(facets?.totals.pending.valueCents ?? 0),
      icon: Clock,
    },
    {
      label: "Aguardando pagamento",
      value: count(facets?.totals.awaitingPayment.count ?? 0),
      sub: money(facets?.totals.awaitingPayment.valueCents ?? 0),
      icon: Send,
    },
    {
      label: "Pagamentos recusados",
      value: count(facets?.totals.declined.count ?? 0),
      sub: money(facets?.totals.declined.valueCents ?? 0),
      icon: XCircle,
    },
    {
      label: "Convertidos",
      value: count(facets?.totals.recovered.count ?? 0),
      sub: money(facets?.totals.recovered.valueCents ?? 0),
      icon: BadgeCheck,
    },
    {
      label: "Lembretes enviados",
      value: count(facets?.totals.remindersSent ?? 0),
      sub: "e-mail + WhatsApp",
      icon: BellRing,
    },
    {
      label: "Receita recuperada",
      value: money(facets?.totals.recoveredRevenueCents ?? 0),
      sub: "converteu após o lembrete",
      icon: TrendingUp,
    },
    {
      label: "Taxa de recuperação",
      value: formatPercent(facets?.totals.recoveryRate ?? 0, "pt-PT"),
      sub: "recuperados ÷ lembretes",
      icon: Percent,
    },
  ];

  const total = listData?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Carrinhos</h2>
          <p className="text-muted-foreground text-sm">
            {status === "loading" && !listData
              ? "Carregando carrinhos…"
              : `${count(total)} carrinho(s) encontrado(s). Clique em um carrinho para ver todos os detalhes.`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" onClick={() => setImportOpen(true)}>
              <Upload /> Importar planilha
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={total === 0}
              onClick={() => exportCarts({ filters: queryString })}
            >
              <Download /> Exportar CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openPendingReminderDialog}
            >
              <Megaphone /> Novo disparo manual
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={status === "loading"}
              onClick={() => fetchData()}
            >
              <RefreshCw
                className={status === "loading" ? "animate-spin" : undefined}
              />{" "}
              Atualizar
            </Button>
          </div>
          {lastSyncedAt && (
            <span className="text-muted-foreground text-xs">
              Última sincronização:{" "}
              {lastSyncedAt.toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setInfoOpen((o) => !o)}
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium"
        >
          Entenda os status
          <ChevronDown
            className={
              infoOpen
                ? "size-4 rotate-180 transition-transform"
                : "size-4 transition-transform"
            }
          />
        </button>
        {infoOpen && (
          <div className="text-muted-foreground border-t px-4 py-3 text-sm leading-relaxed">
            A loja vai da landing direto ao checkout, sem carrinho clássico —
            por isso o “carrinho” aqui é o{" "}
            <strong>pedido gerado e ainda não pago</strong>.{" "}
            <strong>Aguardando pagamento</strong>: cobrança criada, sem
            confirmação ainda. <strong>Pendente</strong>: em
            processamento/análise no gateway. <strong>Pago</strong>: confirmado
            pelo webhook do gateway — nunca pelo navegador.{" "}
            <strong>Abandonado</strong>: aguardando pagamento há mais de 24h sem
            atualização. <strong>Recuperado</strong>: marcado à mão pelo
            operador — aparece aqui como convertido, mas não entra na receita do
            Financeiro, que só conta pagamento confirmado pelo gateway. Os
            demais estados (expirado, cancelado, reembolsado, chargeback) ficam
            agrupados em “Outros”.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {cards.map((c) => (
          <Card key={c.label} className="gap-2 py-4">
            <CardContent className="space-y-1 px-4">
              <div className="text-muted-foreground flex items-center gap-1.5">
                <c.icon className="text-primary size-3.5" aria-hidden="true" />
                <span className="text-xs leading-tight">{c.label}</span>
              </div>
              <p className="text-lg font-bold tracking-tight">{c.value}</p>
              <p className="text-muted-foreground truncate text-xs">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Filtrar por status"
        >
          {CART_TABS.map((t) => (
            <Button
              key={t.key}
              type="button"
              size="sm"
              variant={tab === t.key ? "default" : "outline"}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() =>
                updateParams({ status: t.key === "all" ? undefined : t.key })
              }
            >
              {t.label}
              <span
                className={
                  tab === t.key ? "opacity-80" : "text-muted-foreground"
                }
              >
                {count(facets?.tabCounts[t.key] ?? 0)}
              </span>
            </Button>
          ))}
        </div>

        <Button type="button" onClick={openPendingReminderDialog}>
          <Mail /> Enviar lembrete aos pendentes
        </Button>
      </div>

      <CartFilters
        value={filters}
        onChange={(patch) => updateParams(patch as Record<string, string>)}
        onClear={() =>
          updateParams({ ...EMPTY_CART_FILTERS, status: undefined })
        }
        products={products}
        hasActiveFilters={hasActiveFilters}
        sort={sort}
        onSortChange={(next) => {
          const [by, dir] = next.split(":");
          updateParams({ sortBy: by, sortDir: dir });
        }}
      />

      {selected.size > 0 && (
        <div className="bg-accent/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <p className="text-sm font-medium">
            {selected.size}{" "}
            {selected.size === 1
              ? "carrinho selecionado"
              : "carrinhos selecionados"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openSelectionReminderDialog}
            >
              <Mail /> Enviar lembrete
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() => runBulkAction("mark_recovered")}
            >
              <CheckCircle2 /> Marcar convertido
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() => runBulkAction("mark_pending")}
            >
              Marcar pendente
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() => runBulkAction("mark_refused")}
            >
              Marcar recusado
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={createCampaignFromSelection}
            >
              <Megaphone /> Criar campanha
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => exportCarts({ orderIds: Array.from(selected) })}
            >
              <Download /> Exportar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() => runBulkAction("archive")}
            >
              <Archive /> Arquivar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              <X /> Limpar seleção
            </Button>
          </div>
        </div>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <CartsTable
          rows={rows}
          loading={status === "loading"}
          error={status === "error"}
          onRetry={() => fetchData()}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onOpenDetail={setDetailOrderId}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={(by) =>
            updateParams({
              sortBy: by,
              sortDir: sortBy === by && sortDir === "desc" ? "asc" : "desc",
            })
          }
          onSendReminder={openReminderFor}
          onOpenWhatsApp={handleOpenWhatsApp}
          onMarkStatus={handleMarkStatus}
          onArchive={handleArchive}
          onSync={handleSync}
          onCancel={setCancelTarget}
          onExportOne={(orderId) => exportCarts({ orderIds: [orderId] })}
          syncingIds={syncingIds}
          hasFilters={hasActiveFilters}
        />
        {listData && listData.total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={listData.total}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={(p) =>
              updateParams({ page: p }, { resetPage: false })
            }
            onPageSizeChange={(ps) => updateParams({ pageSize: ps })}
          />
        )}
      </Card>

      <CartDetailSheet
        orderId={detailOrderId}
        onClose={() => setDetailOrderId(null)}
        onSendReminder={openReminderForId}
        onOpenWhatsApp={handleOpenWhatsAppById}
        onMarkStatus={handleMarkStatus}
        onArchive={handleArchive}
        onSync={handleSync}
        onCancel={setCancelTarget}
        syncing={syncingIds.has(detailOrderId ?? "")}
        refreshToken={detailRefreshToken}
      />

      <ReminderDialog
        open={reminderTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReminderTarget(null);
            pendingIdsRef.current = null;
          }
        }}
        targets={reminderTarget?.rows ?? []}
        matchedTotal={reminderTarget?.matchedTotal}
        sending={sending}
        onConfirm={confirmReminder}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={afterMutation}
      />

      <CancelOrderDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        sending={cancelSending}
        error={cancelError}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
