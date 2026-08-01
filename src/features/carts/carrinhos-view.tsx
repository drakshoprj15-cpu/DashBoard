"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  Mail,
  Megaphone,
  RefreshCw,
  X,
} from "lucide-react";

import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { CART_TABS, ORDER_STATUS_LABEL, type CartTab } from "@/features/carts/status";
import type {
  CartListResponseDTO,
  PendingReminderCandidatesDTO,
} from "@/features/carts/client-types";
import { sendCartReminderAction, bulkSendReminderAction, cancelCartOrderAction } from "@/features/carts/actions";
import { CartFilters, EMPTY_CART_FILTERS, type CartFiltersState } from "@/features/carts/cart-filters";
import { CartsTable } from "@/features/carts/carts-table";
import { CartDetailSheet } from "@/features/carts/cart-detail-sheet";
import { BulkReminderDialog } from "@/features/carts/bulk-reminder-dialog";
import { CancelOrderDialog } from "@/features/carts/cancel-order-dialog";
import type { ProductOption } from "@/features/products/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type BulkReminderSource =
  | { kind: "selection"; orderIds: string[] }
  | { kind: "pending"; orderIds: string[]; matchedTotal: number }
  | null;

function isCartTab(value: string | null): value is CartTab {
  return value !== null && CART_TABS.some((t) => t.key === value);
}

export function CarrinhosView({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: CartTab = isCartTab(searchParams.get("status")) ? (searchParams.get("status") as CartTab) : "all";
  const filters: CartFiltersState = {
    q: searchParams.get("q") ?? "",
    method: searchParams.get("method") ?? "",
    gateway: searchParams.get("gateway") ?? "",
    country: searchParams.get("country") ?? "",
    currency: searchParams.get("currency") ?? "",
    productId: searchParams.get("productId") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  };
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;
  const sortBy = searchParams.get("sortBy") === "totalCents" ? "totalCents" : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const hasActiveFilters =
    Boolean(filters.q || filters.method || filters.gateway || filters.country || filters.currency || filters.productId || filters.from || filters.to) ||
    tab !== "all";

  const updateParams = React.useCallback(
    (patch: Record<string, string | number | undefined>, opts?: { resetPage?: boolean }) => {
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
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    return params.toString();
  }, [filters.q, filters.method, filters.gateway, filters.country, filters.currency, filters.productId, filters.from, filters.to, tab, page, pageSize, sortBy, sortDir]);

  const [listData, setListData] = React.useState<CartListResponseDTO | null>(null);
  const [status, setStatus] = React.useState<"loading" | "success" | "error">("loading");
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
  const [bulkReminder, setBulkReminder] = React.useState<BulkReminderSource>(null);
  const [bulkSending, setBulkSending] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState<string | null>(null);
  const [cancelSending, setCancelSending] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | undefined>();

  async function handleSync(orderId: string) {
    setSyncingIds((prev) => new Set(prev).add(orderId));
    try {
      const res = await fetch(`/api/carrinhos/${orderId}/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Não foi possível sincronizar com o gateway.");
      } else {
        toast.success(
          json.orderStatus
            ? `Status sincronizado: ${ORDER_STATUS_LABEL[json.orderStatus] ?? json.orderStatus}`
            : "Sincronizado — sem mudança de status.",
        );
        fetchData();
        setDetailRefreshToken((t) => t + 1);
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

  async function handleSendReminder(orderId: string) {
    const result = await sendCartReminderAction(orderId);
    if (result.ok) {
      toast.success(result.message ?? "Lembrete enviado.");
      fetchData();
      setDetailRefreshToken((t) => t + 1);
    } else {
      toast.error(result.error ?? "Não foi possível enviar o lembrete.");
    }
  }

  async function openPendingReminderDialog() {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.method) params.set("method", filters.method);
    if (filters.gateway) params.set("gateway", filters.gateway);
    if (filters.country) params.set("country", filters.country);
    if (filters.currency) params.set("currency", filters.currency);
    if (filters.productId) params.set("productId", filters.productId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

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
    setBulkReminder({ kind: "pending", orderIds: json.orderIds, matchedTotal: json.matchedTotal });
  }

  function openSelectionReminderDialog() {
    if (selected.size === 0) return;
    setBulkReminder({ kind: "selection", orderIds: Array.from(selected) });
  }

  async function confirmBulkReminder() {
    if (!bulkReminder) return;
    setBulkSending(true);
    try {
      const result = await bulkSendReminderAction(bulkReminder.orderIds);
      if (result.sent > 0) {
        toast.success(`Lembrete enviado para ${result.sent} ${result.sent === 1 ? "cliente" : "clientes"}.`);
      }
      if (result.skipped > 0) {
        toast.warning(
          `${result.skipped} não receberam${result.errors[0] ? ` (${result.errors[0]})` : ""}.`,
        );
      }
      setBulkReminder(null);
      setSelected(new Set());
      fetchData();
    } finally {
      setBulkSending(false);
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
      fetchData();
      setDetailRefreshToken((t) => t + 1);
    } else {
      setCancelError(result.error);
    }
  }

  async function exportOrders(orderIds: string[]) {
    try {
      const res = await fetch("/api/carrinhos/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
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
    } catch {
      toast.error("Não foi possível exportar.");
    }
  }

  function createCampaignFromSelection() {
    const rows = listData?.rows ?? [];
    const ids = new Set<string>();
    for (const orderId of selected) {
      const row = rows.find((r) => r.orderId === orderId);
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
    const rows = listData?.rows ?? [];
    setSelected((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.orderId));
      if (allSelected) return new Set();
      return new Set(rows.map((r) => r.orderId));
    });
  }

  const facets = listData?.facets;
  const cards = [
    {
      label: "Aguardando pagamento",
      value: formatNumber(facets?.totals.awaitingPayment.count ?? 0, "pt-PT"),
      sub: formatMoney(facets?.totals.awaitingPayment.valueCents ?? 0, "EUR", "pt-PT"),
    },
    {
      label: "Pendentes",
      value: formatNumber(facets?.totals.pending.count ?? 0, "pt-PT"),
      sub: formatMoney(facets?.totals.pending.valueCents ?? 0, "EUR", "pt-PT"),
    },
    {
      label: "Pagos",
      value: formatNumber(facets?.totals.paid.count ?? 0, "pt-PT"),
      sub: formatMoney(facets?.totals.paid.valueCents ?? 0, "EUR", "pt-PT"),
    },
    {
      label: "Recusados",
      value: formatNumber(facets?.totals.declined.count ?? 0, "pt-PT"),
      sub: formatMoney(facets?.totals.declined.valueCents ?? 0, "EUR", "pt-PT"),
    },
    {
      label: "Taxa de conversão",
      value: formatPercent(facets?.totals.conversionRate ?? 0, "pt-PT"),
      sub: "pagos ÷ total no filtro",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Carrinhos e pagamentos</h2>
          <p className="text-muted-foreground text-sm">
            Acompanhe checkouts iniciados, pagamentos pendentes, recusados e vendas confirmadas em tempo real.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button type="button" variant="outline" size="sm" disabled={status === "loading"} onClick={() => fetchData()}>
            <RefreshCw className={status === "loading" ? "animate-spin" : undefined} /> Atualizar dados
          </Button>
          {lastSyncedAt && (
            <span className="text-muted-foreground text-xs">
              Última sincronização: {lastSyncedAt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
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
          <ChevronDown className={infoOpen ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} />
        </button>
        {infoOpen && (
          <div className="text-muted-foreground border-t px-4 py-3 text-sm leading-relaxed">
            A loja vai da landing direto ao checkout, sem carrinho clássico — por isso o “carrinho” aqui é o{" "}
            <strong>pedido gerado e ainda não pago</strong>. <strong>Aguardando pagamento</strong>: cobrança criada,
            sem confirmação ainda. <strong>Pendente</strong>: em processamento/análise no gateway.{" "}
            <strong>Pago</strong>: confirmado pelo webhook do gateway — nunca pelo navegador.{" "}
            <strong>Abandonado</strong>: aguardando pagamento há mais de 24h sem atualização. Os demais estados
            (expirado, cancelado, reembolsado, chargeback) ficam agrupados em “Outros”.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{c.label}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-lg font-bold tracking-tight md:text-xl">{c.value}</p>
              <p className="text-muted-foreground text-xs">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por status">
          {CART_TABS.map((t) => (
            <Button
              key={t.key}
              type="button"
              size="sm"
              variant={tab === t.key ? "default" : "outline"}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => updateParams({ status: t.key === "all" ? undefined : t.key })}
            >
              {t.label}
              <span className={tab === t.key ? "opacity-80" : "text-muted-foreground"}>
                {formatNumber(facets?.tabCounts[t.key] ?? 0, "pt-PT")}
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
        onClear={() => updateParams({ ...EMPTY_CART_FILTERS, status: undefined })}
        products={products}
        hasActiveFilters={hasActiveFilters}
      />

      {selected.size > 0 && (
        <div className="bg-accent/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <p className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "carrinho selecionado" : "carrinhos selecionados"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={openSelectionReminderDialog}>
              <Mail /> Enviar lembrete
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={createCampaignFromSelection}>
              <Megaphone /> Criar campanha de e-mail
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => exportOrders(Array.from(selected))}>
              <Download /> Exportar selecionados
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X /> Limpar seleção
            </Button>
          </div>
        </div>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <CartsTable
          rows={listData?.rows ?? []}
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
          onSendReminder={handleSendReminder}
          onSync={handleSync}
          onCancel={setCancelTarget}
          onExportOne={(orderId) => exportOrders([orderId])}
          syncingIds={syncingIds}
          hasFilters={hasActiveFilters}
        />
        {listData && listData.total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={listData.total}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={(p) => updateParams({ page: p }, { resetPage: false })}
            onPageSizeChange={(ps) => updateParams({ pageSize: ps })}
          />
        )}
      </Card>

      <CartDetailSheet
        orderId={detailOrderId}
        onClose={() => setDetailOrderId(null)}
        onSendReminder={handleSendReminder}
        onSync={handleSync}
        onCancel={setCancelTarget}
        syncing={syncingIds.has(detailOrderId ?? "")}
        refreshToken={detailRefreshToken}
      />

      <BulkReminderDialog
        open={bulkReminder !== null}
        onOpenChange={(open) => !open && setBulkReminder(null)}
        recipientsCount={bulkReminder?.orderIds.length ?? 0}
        matchedTotal={bulkReminder?.kind === "pending" ? bulkReminder.matchedTotal : undefined}
        statusesLabel={
          bulkReminder?.kind === "pending"
            ? "Aguardando pagamento, pendente e abandonado"
            : "Carrinhos selecionados manualmente"
        }
        sending={bulkSending}
        onConfirm={confirmBulkReminder}
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
