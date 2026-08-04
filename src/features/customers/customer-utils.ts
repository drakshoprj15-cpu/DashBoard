import {
  CUSTOMER_PAGE_SIZES,
  CUSTOMER_SORTS,
  CUSTOMER_TYPES,
  type CustomerListFilters,
  type CustomerStatusTag,
} from "@/features/customers/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

export function normalizePhone(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return hasPlus ? `+${digits}` : digits;
}

export function normalizeDocument(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 14 ? digits : null;
}

export interface CustomerIdentityCandidate {
  id: string;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  normalizedDocument: string | null;
}

/** Mantém a prioridade de identidade sem jamais comparar apenas pelo nome. */
export function resolveDuplicateCandidate(
  candidates: CustomerIdentityCandidate[],
  identity: Omit<CustomerIdentityCandidate, "id">,
): CustomerIdentityCandidate | null {
  if (identity.normalizedDocument) {
    const byDocument = candidates.find(
      (candidate) =>
        candidate.normalizedDocument === identity.normalizedDocument,
    );
    if (byDocument) return byDocument;
  }
  if (identity.normalizedEmail) {
    const byEmail = candidates.find(
      (candidate) => candidate.normalizedEmail === identity.normalizedEmail,
    );
    if (byEmail) return byEmail;
  }
  if (identity.normalizedPhone) {
    const byPhone = candidates.find(
      (candidate) => candidate.normalizedPhone === identity.normalizedPhone,
    );
    if (byPhone) return byPhone;
  }
  return null;
}

export function maskDocument(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5) return "••••";
  return `${digits.slice(0, 3)}.${"•".repeat(Math.max(3, digits.length - 5))}.${digits.slice(-2)}`;
}

export function maskPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  const prefix = value.trim().startsWith("+") ? `+${digits.slice(0, 2)} ` : "";
  return `${prefix}${"•".repeat(Math.max(6, digits.length - 4))}${digits.slice(-2)}`;
}

export function sanitizeCsvCell(value: unknown): string {
  const stringValue = value == null ? "" : String(value);
  const safeValue = /^[=+\-@]/.test(stringValue)
    ? `'${stringValue}`
    : stringValue;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function calculateNetSpent(input: {
  approvedCents: number;
  refundedCents: number;
  chargebackCents: number;
}): number {
  return Math.max(
    0,
    input.approvedCents - input.refundedCents - input.chargebackCents,
  );
}

export function buildCustomerStatuses(input: {
  paidCount: number;
  pendingCount: number;
  refusedCount: number;
  abandonedCarts: number;
}): CustomerStatusTag[] {
  const statuses: CustomerStatusTag[] = [];
  if (input.paidCount > 0) statuses.push({ key: "buyer", label: "Comprador" });
  else statuses.push({ key: "lead", label: "Lead" });
  if (input.paidCount >= 2)
    statuses.push({ key: "recurring", label: "Recorrente" });
  if (input.abandonedCarts > 0)
    statuses.push({ key: "abandoned", label: "Carrinho abandonado" });
  if (input.pendingCount > 0)
    statuses.push({ key: "pending", label: "Pedido pendente" });
  if (input.refusedCount > 0)
    statuses.push({ key: "refused", label: "Pagamento recusado" });
  return statuses;
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalMoney(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100)
    : null;
}

function optionalNonNegativeInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCustomerFilters(
  params: URLSearchParams,
): CustomerListFilters {
  const requestedPageSize = positiveInt(params.get("pageSize"), 20);
  const pageSize = CUSTOMER_PAGE_SIZES.includes(
    requestedPageSize as (typeof CUSTOMER_PAGE_SIZES)[number],
  )
    ? requestedPageSize
    : 20;
  const requestedType = params.get("type") ?? "all";
  const requestedSort = params.get("sort") ?? "activity_desc";

  return {
    q: (params.get("q") ?? "").trim().slice(0, 120),
    type: CUSTOMER_TYPES.includes(
      requestedType as (typeof CUSTOMER_TYPES)[number],
    )
      ? (requestedType as CustomerListFilters["type"])
      : "all",
    orderStatus: (params.get("orderStatus") ?? "").slice(0, 40),
    origin: (params.get("origin") ?? "").slice(0, 60),
    productId: (params.get("productId") ?? "").slice(0, 40),
    landingPageId: (params.get("landingPageId") ?? "").slice(0, 40),
    campaignId: (params.get("campaignId") ?? "").slice(0, 40),
    country: (params.get("country") ?? "").slice(0, 80),
    state: (params.get("state") ?? "").slice(0, 80),
    city: (params.get("city") ?? "").slice(0, 80),
    hasEmail: params.get("hasEmail") === "true" ? "true" : "",
    hasPhone: params.get("hasPhone") === "true" ? "true" : "",
    emailValid: params.get("emailValid") === "true" ? "true" : "",
    phoneValid: params.get("phoneValid") === "true" ? "true" : "",
    acceptsCommunication:
      params.get("acceptsCommunication") === "true" ? "true" : "",
    hasAbandoned: params.get("hasAbandoned") === "true" ? "true" : "",
    hasPending: params.get("hasPending") === "true" ? "true" : "",
    from: (params.get("from") ?? "").slice(0, 10),
    to: (params.get("to") ?? "").slice(0, 10),
    lastOrderFrom: (params.get("lastOrderFrom") ?? "").slice(0, 10),
    lastOrderTo: (params.get("lastOrderTo") ?? "").slice(0, 10),
    minOrders: optionalNonNegativeInt(params.get("minOrders")),
    maxOrders: optionalNonNegativeInt(params.get("maxOrders")),
    minSpent: optionalMoney(params.get("minSpent")),
    maxSpent: optionalMoney(params.get("maxSpent")),
    page: positiveInt(params.get("page"), 1),
    pageSize,
    sort: CUSTOMER_SORTS.includes(
      requestedSort as (typeof CUSTOMER_SORTS)[number],
    )
      ? (requestedSort as CustomerListFilters["sort"])
      : "activity_desc",
  };
}

export function activityLabel(type: string): string {
  const labels: Record<string, string> = {
    customer_created: "Cliente criado",
    customer_imported: "Cliente importado",
    landing_page_lead: "Lead captado pela landing page",
    order_created: "Pedido criado",
    payment_approved: "Compra aprovada",
    payment_refused: "Pagamento recusado",
    payment_refunded: "Pagamento reembolsado",
    payment_chargeback: "Chargeback registrado",
    order_updated: "Pedido atualizado",
    checkout_started: "Checkout iniciado",
    cart_abandoned: "Carrinho abandonado",
    note_added: "Observação adicionada",
    tag_added: "Tag adicionada",
  };
  return labels[type] ?? "Dados atualizados";
}
