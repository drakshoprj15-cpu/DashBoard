import {
  normalizeEmail,
  normalizeImportedProductName,
} from "@/features/customers/customer-utils";

type UnknownRecord = Record<string, unknown>;

export interface MilluniCustomerSnapshot {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  productName: string;
  firstPurchaseAt: Date;
  lastPurchaseAt: Date;
  sourceOrderId: string;
  sourceReference: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  } | null;
}

export interface MilluniNormalizationResult {
  customers: MilluniCustomerSnapshot[];
  scannedOrders: number;
  paidOrders: number;
  invalidPaidOrders: number;
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function productName(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const name = text(record(item)?.nome);
    const normalized = name ? normalizeImportedProductName(name) : null;
    if (normalized) return normalized;
  }
  return null;
}

function address(value: unknown): MilluniCustomerSnapshot["address"] {
  const source = record(value);
  if (!source) return null;
  const result = {
    street: text(source.morada),
    city: text(source.localidade),
    state: text(source.distrito),
    postalCode: text(source.cp),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

/**
 * Transforma a resposta privada de `/api/off/pedidos` em um contacto por
 * e-mail. Apenas pedidos pagos entram; tentativas pendentes ou falhadas não
 * transformam um lead em comprador no Infinity.
 */
export function normalizeMilluniCustomers(
  payload: unknown,
): MilluniNormalizationResult {
  const root = record(payload);
  const orders = Array.isArray(root?.encomendas) ? root.encomendas : [];
  const grouped = new Map<string, MilluniCustomerSnapshot>();
  let paidOrders = 0;
  let invalidPaidOrders = 0;

  for (const rawOrder of orders) {
    const order = record(rawOrder);
    if (!order || text(order.estado)?.toLocaleLowerCase("pt") !== "pago") {
      continue;
    }
    paidOrders += 1;

    const emailValue = text(order.email);
    const email = emailValue ? normalizeEmail(emailValue) : null;
    const purchasedAt = date(order.pagoEm) ?? date(order.createdAt);
    const sourceOrderId = text(order.id);
    if (!email || !purchasedAt || !sourceOrderId) {
      invalidPaidOrders += 1;
      continue;
    }

    const snapshot: MilluniCustomerSnapshot = {
      email,
      firstName: text(order.nome),
      lastName: text(order.apelido),
      phone: text(order.telefone),
      productName: productName(order.itens) ?? "Compra na Milluni",
      firstPurchaseAt: purchasedAt,
      lastPurchaseAt: purchasedAt,
      sourceOrderId,
      sourceReference: text(order.referencia),
      address: address(order.morada),
    };

    const existing = grouped.get(email);
    if (!existing) {
      grouped.set(email, snapshot);
      continue;
    }

    const firstPurchaseAt =
      existing.firstPurchaseAt <= purchasedAt
        ? existing.firstPurchaseAt
        : purchasedAt;
    if (purchasedAt > existing.lastPurchaseAt) {
      grouped.set(email, { ...snapshot, firstPurchaseAt });
    } else {
      existing.firstPurchaseAt = firstPurchaseAt;
    }
  }

  return {
    customers: Array.from(grouped.values()),
    scannedOrders: orders.length,
    paidOrders,
    invalidPaidOrders,
  };
}
