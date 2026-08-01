/**
 * Formatos de dados trocados com `/api/carrinhos/*` (JSON — datas sempre
 * como string ISO). Vive separado de `queries.ts` porque aquele módulo
 * importa o cliente do banco (postgres/drizzle), que nunca pode entrar no
 * bundle do navegador — mesmo padrão usado em `features/emails/types.ts`.
 */
import type { CartCategory, CartTab } from "@/features/carts/status";

export interface CartRowDTO {
  orderId: string;
  reference: string;
  status: string;
  category: CartCategory;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerDocument: string | null;
  countryCode: string | null;
  productName: string | null;
  quantity: number | null;
  itemCount: number;
  totalCents: number;
  currency: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  gateway: string | null;
  externalId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  lastReminderSentAt: string | null;
  marketingOptOut: boolean;
}

export interface CartFacetsDTO {
  tabCounts: Record<CartTab, number>;
  totals: {
    awaitingPayment: { count: number; valueCents: number };
    pending: { count: number; valueCents: number };
    paid: { count: number; valueCents: number };
    declined: { count: number; valueCents: number };
    conversionRate: number;
  };
}

export interface CartListResponseDTO {
  rows: CartRowDTO[];
  total: number;
  page: number;
  pageSize: number;
  facets: CartFacetsDTO;
}

export interface TimelineEventDTO {
  key: string;
  label: string;
  detail?: string;
  at: string;
  source: "order" | "payment" | "webhook" | "refund" | "chargeback" | "history";
}

export interface CartDetailDTO {
  order: {
    id: string;
    reference: string;
    status: string;
    category: CartCategory;
    currency: string;
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number;
    shippingAddress: unknown;
    billingAddress: unknown;
    shippingMethod: string | null;
    utm: Record<string, string> | null;
    origin: string | null;
    deviceType: string | null;
    countryCode: string | null;
    internalNotes: string | null;
    createdAt: string;
    updatedAt: string;
    paidAt: string | null;
    cancelledAt: string | null;
    lastReminderSentAt: string | null;
  };
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    document: string | null;
    country: string | null;
    marketingOptOut: boolean;
    isBlocked: boolean;
    createdAt: string;
  } | null;
  items: { productName: string; quantity: number; unitPriceCents: number; totalCents: number }[];
  payments: {
    id: string;
    externalId: string | null;
    status: string;
    method: string;
    amountCents: number;
    feeCents: number;
    netCents: number | null;
    currency: string;
    gateway: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    pixQrCode: string | null;
    boletoUrl: string | null;
    failureReason: string | null;
    approvedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  }[];
  refunds: { id: string; amountCents: number; status: string; reason: string | null; createdAt: string }[];
  chargebacks: { id: string; amountCents: number; status: string; reason: string | null; createdAt: string }[];
  consents: { type: string; granted: boolean; source: string | null; createdAt: string }[];
  timeline: TimelineEventDTO[];
}

export interface PendingReminderCandidatesDTO {
  orderIds: string[];
  matchedTotal: number;
}
