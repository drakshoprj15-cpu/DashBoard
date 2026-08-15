import { toUtmifyTrackingParameters } from "@/features/attribution/utm";

export const UTMIFY_ORDERS_URL =
  "https://api.utmify.com.br/api-credentials/orders";

export type UtmifySaleStatus =
  | "waiting_payment"
  | "paid"
  | "refused"
  | "refunded"
  | "chargedback";

export const UTMIFY_STATUS_BY_ORDER_STATUS: Partial<
  Record<string, UtmifySaleStatus>
> = {
  created: "waiting_payment",
  awaiting_payment: "waiting_payment",
  processing: "waiting_payment",
  paid: "paid",
  preparing: "paid",
  shipped: "paid",
  delivered: "paid",
  refused: "refused",
  refunded: "refunded",
  chargeback: "chargedback",
};

export const UTMIFY_PAYMENT_METHOD: Partial<Record<string, string>> = {
  card: "credit_card",
  credit_card: "credit_card",
  apple_pay: "credit_card",
  google_pay: "credit_card",
  pix: "pix",
  mbway: "pix",
  boleto: "boleto",
  multibanco: "boleto",
  paypal: "paypal",
  free_price: "free_price",
};

export function toUtmifyTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function isPascalCasePlatform(value: string): boolean {
  return /^[A-Z][A-Za-z0-9]{1,49}$/.test(value);
}

export interface UtmifyOrderSource {
  reference: string;
  status: string;
  paymentMethod: string;
  platform: string;
  totalCents: number;
  gatewayFeeCents: number;
  netCents: number | null;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
  customer: {
    name: string;
    email: string;
    phone: string | null;
    document: string | null;
    country: string | null;
    ip: string | null;
  };
  products: {
    id: string;
    name: string;
    planId: string | null;
    planName: string | null;
    quantity: number;
    priceInCents: number;
  }[];
  utm: Record<string, unknown>;
}

export function buildUtmifyPayload(
  source: UtmifyOrderSource,
  forcedStatus?: UtmifySaleStatus,
  isTest = false,
) {
  const status = forcedStatus ?? UTMIFY_STATUS_BY_ORDER_STATUS[source.status];
  if (!status) throw new Error("status_not_supported");
  const paymentMethod = UTMIFY_PAYMENT_METHOD[source.paymentMethod];
  if (!paymentMethod) throw new Error("payment_method_not_supported");
  if (!Number.isSafeInteger(source.totalCents) || source.totalCents < 0) {
    throw new Error("invalid_money");
  }

  const gatewayFee = Math.max(0, Math.trunc(source.gatewayFeeCents));
  const sellerNet =
    source.netCents === null
      ? Math.max(0, source.totalCents - gatewayFee)
      : Math.max(0, Math.trunc(source.netCents));

  return {
    orderId: source.reference,
    platform: source.platform,
    paymentMethod,
    status,
    createdAt: toUtmifyTimestamp(source.createdAt),
    approvedDate:
      status === "waiting_payment" || status === "refused" || !source.paidAt
        ? null
        : toUtmifyTimestamp(source.paidAt),
    refundedAt:
      status === "refunded" && source.refundedAt
        ? toUtmifyTimestamp(source.refundedAt)
        : null,
    customer: {
      name: source.customer.name,
      email: source.customer.email,
      phone: source.customer.phone,
      document: source.customer.document,
      country: source.customer.country?.toUpperCase() || undefined,
      ip: source.customer.ip || undefined,
    },
    products: source.products,
    trackingParameters: toUtmifyTrackingParameters(source.utm),
    commission: {
      totalPriceInCents: source.totalCents,
      gatewayFeeInCents: gatewayFee,
      userCommissionInCents: sellerNet,
      currency: source.currency.toUpperCase(),
    },
    ...(isTest ? { isTest: true } : {}),
  };
}

export type UtmifyErrorCode =
  | "invalid_token"
  | "invalid_payload"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "network_error"
  | "unexpected";

export interface UtmifySendResult {
  ok: boolean;
  retryable: boolean;
  httpStatus: number | null;
  code: UtmifyErrorCode | null;
  message: string;
  durationMs: number;
}

function classifyHttp(status: number): Omit<UtmifySendResult, "durationMs"> {
  if (status === 401 || status === 403) {
    return { ok: false, retryable: false, httpStatus: status, code: "invalid_token", message: "Credencial inválida." };
  }
  if (status === 400 || status === 422) {
    return { ok: false, retryable: false, httpStatus: status, code: "invalid_payload", message: "A UTMify rejeitou um campo obrigatório ou formato do pedido." };
  }
  if (status === 429) {
    return { ok: false, retryable: true, httpStatus: status, code: "rate_limited", message: "Limite de requisições atingido." };
  }
  if (status >= 500) {
    return { ok: false, retryable: true, httpStatus: status, code: "unavailable", message: "Serviço temporariamente indisponível." };
  }
  return { ok: false, retryable: false, httpStatus: status, code: "unexpected", message: "Resposta inesperada da UTMify." };
}

/** Envia sem nunca devolver corpo, headers ou token para logs/camadas acima. */
export async function postUtmifyOrder(
  token: string,
  payload: unknown,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<UtmifySendResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await (options.fetcher ?? fetch)(UTMIFY_ORDERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": token },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.ok) {
      return { ok: true, retryable: false, httpStatus: response.status, code: null, message: "Conexão válida.", durationMs: Date.now() - startedAt };
    }
    return { ...classifyHttp(response.status), durationMs: Date.now() - startedAt };
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    return {
      ok: false,
      retryable: true,
      httpStatus: null,
      code: timedOut ? "timeout" : "network_error",
      message: timedOut ? "A UTMify não respondeu dentro do limite." : "Falha de rede ao conectar com a UTMify.",
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function retryDelayMs(attempt: number, random = Math.random): number {
  const exponential = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(exponential * (0.8 + random() * 0.4));
}
