"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CircleCheckBig,
  Clock3,
  Download,
  Filter,
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Upload,
  UserRoundCheck,
  UserRoundPlus,
  Users,
  UserX,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { formatNumber } from "@/lib/format";
import type { ProductOption } from "@/features/products/queries";
import type { CustomerListResponse } from "@/features/customers/types";
import { CustomersTable } from "@/features/customers/customers-table";
import { CustomerDetailSheet } from "@/features/customers/customer-detail-sheet";
import {
  AddCustomerDialog,
  ExportCustomersDialog,
  ImportCustomersDialog,
  SegmentDialog,
} from "@/features/customers/customer-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZES = [20, 50, 100, 200] as const;

const SORT_OPTIONS = [
  ["activity_desc", "Atividade mais recente"],
  ["recent", "Mais recentes"],
  ["oldest", "Mais antigos"],
  ["spent_desc", "Maior valor gasto"],
  ["spent_asc", "Menor valor gasto"],
  ["orders_desc", "Mais pedidos"],
  ["orders_asc", "Menos pedidos"],
  ["name_asc", "Nome A–Z"],
  ["name_desc", "Nome Z–A"],
  ["approval_desc", "Maior taxa de aprovação"],
] as const;

function selectClass() {
  return "border-input bg-background h-9 rounded-md border px-2.5 text-xs shadow-xs outline-none focus:ring-2 focus:ring-ring/40";
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="gap-2 py-3 shadow-xs">
      <CardContent className="flex items-center gap-3 px-3">
        <span className="bg-primary/8 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-[11px]">{label}</p>
          <p className="text-lg leading-tight font-bold tracking-tight">
            {value}
          </p>
          <p className="text-muted-foreground truncate text-[10px]">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomersView({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const [data, setData] = React.useState<CustomerListResponse | null>(null);
  const [status, setStatus] = React.useState<"loading" | "success" | "error">(
    "loading",
  );
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [segmentOpen, setSegmentOpen] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Number(searchParams.get("pageSize") ?? "20") || 20;
  const type = searchParams.get("type") ?? "all";
  const sort = searchParams.get("sort") ?? "activity_desc";
  const queryString = React.useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sort", sort);
    if (!params.has("type")) params.set("type", "all");
    return params.toString();
  }, [searchParams, page, pageSize, sort]);

  const updateParams = React.useCallback(
    (patch: Record<string, string | number | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "" || value === "all")
          params.delete(key);
        else params.set(key, String(value));
      }
      if (resetPage) params.set("page", "1");
      setSelected(new Set());
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (search !== (searchParams.get("q") ?? "")) updateParams({ q: search });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search, searchParams, updateParams]);

  React.useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function run() {
      setStatus("loading");
      try {
        const response = await fetch(`/api/customers?${queryString}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const json = (await response.json()) as CustomerListResponse;
        if (!active) return;
        setData(json);
        setStatus("success");
      } catch (error) {
        if (!active) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setStatus("error");
      }
    }
    run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryString, refreshToken]);

  const rows = data?.rows ?? [];
  const stats = data?.stats;
  const activeFilters = [
    ["type", type !== "all" ? type : ""],
    ["orderStatus", searchParams.get("orderStatus") ?? ""],
    ["origin", searchParams.get("origin") ?? ""],
    ["productId", searchParams.get("productId") ?? ""],
    ["landingPageId", searchParams.get("landingPageId") ?? ""],
    ["campaignId", searchParams.get("campaignId") ?? ""],
    ["country", searchParams.get("country") ?? ""],
    ["state", searchParams.get("state") ?? ""],
    ["city", searchParams.get("city") ?? ""],
    ["hasEmail", searchParams.get("hasEmail") ?? ""],
    ["hasPhone", searchParams.get("hasPhone") ?? ""],
    ["emailValid", searchParams.get("emailValid") ?? ""],
    ["phoneValid", searchParams.get("phoneValid") ?? ""],
    ["acceptsCommunication", searchParams.get("acceptsCommunication") ?? ""],
    ["hasAbandoned", searchParams.get("hasAbandoned") ?? ""],
    ["hasPending", searchParams.get("hasPending") ?? ""],
    ["from", searchParams.get("from") ?? ""],
    ["to", searchParams.get("to") ?? ""],
    ["lastOrderFrom", searchParams.get("lastOrderFrom") ?? ""],
    ["lastOrderTo", searchParams.get("lastOrderTo") ?? ""],
    ["minOrders", searchParams.get("minOrders") ?? ""],
    ["maxOrders", searchParams.get("maxOrders") ?? ""],
    ["minSpent", searchParams.get("minSpent") ?? ""],
    ["maxSpent", searchParams.get("maxSpent") ?? ""],
  ].filter(([, value]) => Boolean(value));

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((previous) => {
      const allSelected =
        rows.length > 0 && rows.every((row) => previous.has(row.id));
      return allSelected ? new Set() : new Set(rows.map((row) => row.id));
    });
  }

  async function exportCustomers(scope: string) {
    const filteredParams = new URLSearchParams(queryString);
    filteredParams.delete("page");
    filteredParams.delete("pageSize");
    if (scope === "all") {
      for (const key of Array.from(filteredParams.keys())) {
        if (!["sort"].includes(key)) filteredParams.delete(key);
      }
    }
    const response = await fetch("/api/customers/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: filteredParams.toString(),
        scope,
        customerIds: scope === "selected" ? Array.from(selected) : undefined,
      }),
    });
    if (!response.ok) {
      toast.error("Não foi possível exportar os clientes.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída.");
  }

  async function bulkAction(action: "add_tag" | "remove_tag" | "anonymize") {
    if (selected.size === 0) return;
    const tag =
      action === "add_tag" || action === "remove_tag"
        ? window.prompt(
            action === "add_tag" ? "Nome da tag:" : "Tag a remover:",
          )
        : undefined;
    if ((action === "add_tag" || action === "remove_tag") && !tag?.trim())
      return;
    if (
      action === "anonymize" &&
      !window.confirm(
        "Anonimizar os clientes selecionados? Dados pessoais serão removidos e esta ação não pode ser desfeita.",
      )
    )
      return;
    setBulkPending(true);
    try {
      const response = await fetch("/api/customers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          customerIds: Array.from(selected),
          tag,
        }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !json.ok) throw new Error(json.error);
      toast.success(json.message);
      setSelected(new Set());
      setRefreshToken((token) => token + 1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Ação não concluída.",
      );
    } finally {
      setBulkPending(false);
    }
  }

  function sendSelectedToEmails() {
    const eligible = rows.filter(
      (row) =>
        selected.has(row.id) &&
        row.emailStatus === "valid" &&
        row.acceptsCommunication &&
        !row.isBlocked,
    );
    const ignored = selected.size - eligible.length;
    if (eligible.length === 0) {
      toast.error(
        "Nenhum selecionado possui e-mail válido e consentimento ativo.",
      );
      return;
    }
    if (ignored > 0)
      toast.info(
        `${ignored} contato(s) serão ignorados por bloqueio, descadastro ou e-mail inválido.`,
      );
    router.push(
      `/emails?recipients=${eligible.map((row) => row.id).join(",")}`,
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clientes</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {stats
              ? `${formatNumber(stats.totalContacts)} contatos · ${formatNumber(stats.importedPaid)} pagos informados · ${formatNumber(stats.importedPending)} pendentes informados`
              : "Clientes, compradores e leads em um só lugar"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload /> Importar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSegmentOpen(true)}
          >
            <ListFilter /> Criar segmento
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus /> Adicionar cliente
          </Button>
          <Button type="button" size="sm" onClick={() => setExportOpen(true)}>
            <Download /> Exportar clientes
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
        <StatCard
          label="Total de contatos"
          value={formatNumber(stats?.totalContacts ?? 0)}
          description="base consolidada"
          icon={Users}
        />
        <StatCard
          label="Pagos informados"
          value={formatNumber(stats?.importedPaid ?? 0)}
          description="classificados na importação"
          icon={CircleCheckBig}
        />
        <StatCard
          label="Pendentes informados"
          value={formatNumber(stats?.importedPending ?? 0)}
          description="aguardando confirmação"
          icon={Clock3}
        />
        <StatCard
          label="Compradores confirmados"
          value={formatNumber(stats?.buyers ?? 0)}
          description="pedido aprovado no sistema"
          icon={UserRoundCheck}
        />
        <StatCard
          label="Leads sem situação"
          value={formatNumber(stats?.leads ?? 0)}
          description="sem compra informada"
          icon={UserRoundPlus}
        />
        <StatCard
          label="Carrinhos abandonados"
          value={formatNumber(stats?.abandonedCarts ?? 0)}
          description="contatos recuperáveis"
          icon={WalletCards}
        />
        <StatCard
          label="Recorrentes confirmados"
          value={formatNumber(stats?.recurring ?? 0)}
          description="2 ou mais compras reais"
          icon={RefreshCw}
        />
        <StatCard
          label="Pedidos reais pendentes"
          value={formatNumber(stats?.pending ?? 0)}
          description="criados no sistema"
          icon={UserX}
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-xs">
        <div className="space-y-3 border-b p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar por nome, email, telefone, CPF ou número do pedido..."
                className="h-10 pr-16 pl-9"
              />
              <kbd className="bg-muted text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px]">
                Ctrl K
              </kbd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={filtersOpen ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <Filter /> Filtros{" "}
                {activeFilters.length > 0 && `(${activeFilters.length})`}
              </Button>
              <select
                aria-label="Tipo de contato"
                value={type}
                onChange={(event) => updateParams({ type: event.target.value })}
                className={selectClass()}
              >
                <option value="all">Todos os contatos</option>
                <option value="imported_paid">
                  Pagos informados pela planilha
                </option>
                <option value="imported_pending">
                  Pendentes informados pela planilha
                </option>
                <option value="buyer">Compradores confirmados</option>
                <option value="lead">Leads sem situação</option>
                <option value="abandoned">Carrinhos abandonados</option>
                <option value="checkout">Checkout iniciado</option>
                <option value="recurring">Recorrentes</option>
                <option value="pending">Pedidos reais pendentes</option>
                <option value="refused">Pagamentos recusados</option>
                <option value="no_purchase">Clientes sem compra</option>
              </select>
              <select
                aria-label="Ordenar por"
                value={sort}
                onChange={(event) => updateParams({ sort: event.target.value })}
                className={selectClass()}
              >
                {SORT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Atualizar dados"
                onClick={() => setRefreshToken((token) => token + 1)}
              >
                <RefreshCw />
              </Button>
            </div>
          </div>

          {filtersOpen && (
            <div className="bg-muted/30 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <select
                aria-label="Status do pedido"
                value={searchParams.get("orderStatus") ?? ""}
                onChange={(event) =>
                  updateParams({ orderStatus: event.target.value })
                }
                className={selectClass()}
              >
                <option value="">Status do pedido</option>
                <option value="paid">Pago</option>
                <option value="created">Criado</option>
                <option value="awaiting_payment">Aguardando pagamento</option>
                <option value="processing">Processando</option>
                <option value="refused">Recusado</option>
                <option value="cancelled">Cancelado</option>
                <option value="expired">Expirado</option>
                <option value="refunded">Reembolsado</option>
                <option value="chargeback">Chargeback</option>
              </select>
              <select
                aria-label="Origem"
                value={searchParams.get("origin") ?? ""}
                onChange={(event) =>
                  updateParams({ origin: event.target.value })
                }
                className={selectClass()}
              >
                <option value="">Todas as origens</option>
                {(data?.facets.origins ?? []).map((origin) => (
                  <option key={origin} value={origin}>
                    {origin}
                  </option>
                ))}
              </select>
              <select
                aria-label="Produto"
                value={searchParams.get("productId") ?? ""}
                onChange={(event) =>
                  updateParams({ productId: event.target.value })
                }
                className={selectClass()}
              >
                <option value="">Todos os produtos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="País"
                value={searchParams.get("country") ?? ""}
                onChange={(event) =>
                  updateParams({ country: event.target.value })
                }
                className={selectClass()}
              >
                <option value="">Todos os países</option>
                {(data?.facets.countries ?? []).map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
              <select
                aria-label="Landing page"
                value={searchParams.get("landingPageId") ?? ""}
                onChange={(event) =>
                  updateParams({ landingPageId: event.target.value })
                }
                className={selectClass()}
              >
                <option value="">Todas as landing pages</option>
                {(data?.facets.landingPages ?? []).map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Campanha"
                value={searchParams.get("campaignId") ?? ""}
                onChange={(event) =>
                  updateParams({ campaignId: event.target.value })
                }
                className={selectClass()}
              >
                <option value="">Todas as campanhas</option>
                {(data?.facets.campaigns ?? []).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Estado"
                value={searchParams.get("state") ?? ""}
                onChange={(event) =>
                  updateParams({ state: event.target.value })
                }
                className={selectClass()}
              >
                <option value="">Todos os estados</option>
                {(data?.facets.states ?? []).map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <select
                aria-label="Cidade"
                value={searchParams.get("city") ?? ""}
                onChange={(event) => updateParams({ city: event.target.value })}
                className={selectClass()}
              >
                <option value="">Todas as cidades</option>
                {(data?.facets.cities ?? []).map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={searchParams.get("hasEmail") === "true"}
                  onChange={(event) =>
                    updateParams({
                      hasEmail: event.target.checked ? "true" : "",
                    })
                  }
                  className="accent-primary size-4"
                />{" "}
                Possui e-mail
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={searchParams.get("hasPhone") === "true"}
                  onChange={(event) =>
                    updateParams({
                      hasPhone: event.target.checked ? "true" : "",
                    })
                  }
                  className="accent-primary size-4"
                />{" "}
                Possui telefone
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={searchParams.get("emailValid") === "true"}
                  onChange={(event) =>
                    updateParams({
                      emailValid: event.target.checked ? "true" : "",
                    })
                  }
                  className="accent-primary size-4"
                />
                E-mail válido
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={searchParams.get("phoneValid") === "true"}
                  onChange={(event) =>
                    updateParams({
                      phoneValid: event.target.checked ? "true" : "",
                    })
                  }
                  className="accent-primary size-4"
                />
                Telefone válido
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={searchParams.get("acceptsCommunication") === "true"}
                  onChange={(event) =>
                    updateParams({
                      acceptsCommunication: event.target.checked ? "true" : "",
                    })
                  }
                  className="accent-primary size-4"
                />{" "}
                Aceita comunicações
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={searchParams.get("hasAbandoned") === "true"}
                  onChange={(event) =>
                    updateParams({
                      hasAbandoned: event.target.checked ? "true" : "",
                    })
                  }
                  className="accent-primary size-4"
                />
                Possui carrinho abandonado
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={searchParams.get("hasPending") === "true"}
                  onChange={(event) =>
                    updateParams({
                      hasPending: event.target.checked ? "true" : "",
                    })
                  }
                  className="accent-primary size-4"
                />
                Possui pedido pendente
              </label>
              <Input
                aria-label="Primeiro contato a partir de"
                type="date"
                value={searchParams.get("from") ?? ""}
                onChange={(event) => updateParams({ from: event.target.value })}
                className="h-9 text-xs"
              />
              <Input
                aria-label="Primeiro contato até"
                type="date"
                value={searchParams.get("to") ?? ""}
                onChange={(event) => updateParams({ to: event.target.value })}
                className="h-9 text-xs"
              />
              <Input
                aria-label="Último pedido a partir de"
                type="date"
                value={searchParams.get("lastOrderFrom") ?? ""}
                onChange={(event) =>
                  updateParams({ lastOrderFrom: event.target.value })
                }
                className="h-9 text-xs"
              />
              <Input
                aria-label="Último pedido até"
                type="date"
                value={searchParams.get("lastOrderTo") ?? ""}
                onChange={(event) =>
                  updateParams({ lastOrderTo: event.target.value })
                }
                className="h-9 text-xs"
              />
              <Input
                type="number"
                min="0"
                placeholder="Mínimo de pedidos"
                value={searchParams.get("minOrders") ?? ""}
                onChange={(event) =>
                  updateParams({ minOrders: event.target.value })
                }
                className="h-9 text-xs"
              />
              <Input
                type="number"
                min="0"
                placeholder="Máximo de pedidos"
                value={searchParams.get("maxOrders") ?? ""}
                onChange={(event) =>
                  updateParams({ maxOrders: event.target.value })
                }
                className="h-9 text-xs"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Gasto mínimo"
                value={searchParams.get("minSpent") ?? ""}
                onChange={(event) =>
                  updateParams({ minSpent: event.target.value })
                }
                className="h-9 text-xs"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Gasto máximo"
                value={searchParams.get("maxSpent") ?? ""}
                onChange={(event) =>
                  updateParams({ maxSpent: event.target.value })
                }
                className="h-9 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  router.replace(pathname);
                }}
              >
                <X /> Limpar filtros
              </Button>
            </div>
          )}

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  className="bg-primary/8 text-primary hover:bg-primary/15 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
                  onClick={() => updateParams({ [key]: "" })}
                >
                  {key}: {value} <X className="size-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="bg-primary/6 border-primary/15 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <p className="mr-auto text-sm font-medium">
              {selected.size} selecionado(s)
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkPending}
              onClick={() => void exportCustomers("selected")}
            >
              <Download /> Exportar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkPending}
              onClick={() => void bulkAction("add_tag")}
            >
              <Tags /> Adicionar tag
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkPending}
              onClick={() => void bulkAction("remove_tag")}
            >
              <Tags /> Remover tag
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkPending}
              onClick={() => setSegmentOpen(true)}
            >
              <ListFilter /> Criar segmento
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkPending}
              onClick={sendSelectedToEmails}
            >
              Enviar para E-mails
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={bulkPending}
              onClick={() => void bulkAction("anonymize")}
            >
              <UserX /> Anonimizar
            </Button>
          </div>
        )}

        {status === "loading" && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 9 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        ) : status === "error" ? (
          <EmptyState
            icon={RefreshCw}
            title="Erro ao carregar clientes"
            description="Verifique a conexão e tente novamente."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefreshToken((token) => token + 1)}
              >
                Tentar novamente
              </Button>
            }
            className="min-h-[340px]"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              activeFilters.length > 0 || search
                ? "Nenhum resultado para os filtros"
                : "Nenhum cliente encontrado"
            }
            description={
              activeFilters.length > 0 || search
                ? "Ajuste a busca ou limpe os filtros para ampliar os resultados."
                : "Os clientes aparecerão aqui quando realizarem pedidos, iniciarem um checkout ou forem importados."
            }
            action={
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setImportOpen(true)}
                >
                  Importar clientes
                </Button>
                <Button type="button" onClick={() => setAddOpen(true)}>
                  Criar cliente
                </Button>
              </div>
            }
            className="min-h-[340px]"
          />
        ) : (
          <CustomersTable
            rows={rows}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={setDetailId}
          />
        )}

        {data && data.total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            pageSizeOptions={PAGE_SIZES}
            onPageChange={(next) => updateParams({ page: next }, false)}
            onPageSizeChange={(next) => updateParams({ pageSize: next })}
            locale="pt-BR"
          />
        )}
      </Card>

      <CustomerDetailSheet
        customerId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
      <AddCustomerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => {
          setRefreshToken((token) => token + 1);
          setDetailId(id);
        }}
        onDuplicate={(id) => {
          setAddOpen(false);
          setDetailId(id);
        }}
      />
      <ImportCustomersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => setRefreshToken((token) => token + 1)}
      />
      <ExportCustomersDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        selectedCount={selected.size}
        onExport={exportCustomers}
      />
      <SegmentDialog
        open={segmentOpen}
        onOpenChange={setSegmentOpen}
        currentFilters={queryString}
        estimatedCount={data?.total ?? 0}
      />
    </div>
  );
}
