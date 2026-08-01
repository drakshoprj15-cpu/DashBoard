import type { CartFilters } from "@/features/carts/queries";
import { isCartTab } from "@/features/carts/status";

/** Data `yyyy-mm-dd` do início do dia, em UTC. `undefined` se inválida/ausente. */
function parseDateFrom(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Data `yyyy-mm-dd` do fim do dia (inclusivo), em UTC. `undefined` se inválida/ausente. */
function parseDateTo(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Lê e valida os filtros de Carrinhos a partir da query string da requisição. */
export function parseCartFilters(searchParams: URLSearchParams): CartFilters {
  const tab = searchParams.get("status");

  return {
    search: searchParams.get("q") ?? undefined,
    tab: isCartTab(tab) ? tab : "all",
    paymentMethod: searchParams.get("method") ?? undefined,
    gateway: searchParams.get("gateway") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    currency: searchParams.get("currency") ?? undefined,
    productId: searchParams.get("productId") ?? undefined,
    dateFrom: parseDateFrom(searchParams.get("from")),
    dateTo: parseDateTo(searchParams.get("to")),
    page: Number(searchParams.get("page") ?? "1"),
    pageSize: Number(searchParams.get("pageSize") ?? "25"),
    sortBy: searchParams.get("sortBy") === "totalCents" ? "totalCents" : "createdAt",
    sortDir: searchParams.get("sortDir") === "asc" ? "asc" : "desc",
  };
}
