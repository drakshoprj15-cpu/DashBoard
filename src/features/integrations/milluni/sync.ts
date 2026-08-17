import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/database/client";
import {
  customerActivities,
  customerAddresses,
  customers,
} from "@/database/schema";
import {
  CUSTOMER_IMPORT_STATUS_TAGS,
  mergeCustomerImportTags,
  normalizePhone,
} from "@/features/customers/customer-utils";
import {
  normalizeMilluniCustomers,
  type MilluniCustomerSnapshot,
} from "@/features/integrations/milluni/normalize";

const DEFAULT_BASE_URL = "https://milluni.vip";
const SOURCE_TAG = "Milluni";
const QUERY_CHUNK_SIZE = 500;
const INSERT_CHUNK_SIZE = 200;

export class MilluniSyncError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "configuration_missing"
      | "authentication_failed"
      | "password_change_required"
      | "orders_unavailable"
      | "invalid_response",
  ) {
    super(message);
  }
}

export interface MilluniSyncResult {
  scannedOrders: number;
  paidOrders: number;
  uniqueCustomers: number;
  imported: number;
  updated: number;
  unchanged: number;
  invalidPaidOrders: number;
}

type ExistingCustomer = {
  id: string;
  email: string;
  normalizedEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  importedProductName: string | null;
  tags: unknown;
  firstPurchaseAt: Date | null;
  lastPurchaseAt: Date | null;
  deletedAt: Date | null;
};

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function configuredBaseUrl(): string {
  const raw = process.env.MILLUNI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") {
    throw new MilluniSyncError(
      "A URL da Milluni precisa usar HTTPS.",
      "configuration_missing",
    );
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function splitSetCookieHeader(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((item) => item.trim());
}

function responseCookies(headers: Headers): string {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values =
    extendedHeaders.getSetCookie?.() ??
    splitSetCookieHeader(headers.get("set-cookie") ?? "");
  return values
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function fetchMilluniOrders(): Promise<unknown> {
  const user = process.env.MILLUNI_ADMIN_USER?.trim();
  const password = process.env.MILLUNI_ADMIN_PASSWORD;
  if (!user || !password) {
    throw new MilluniSyncError(
      "Configure MILLUNI_ADMIN_USER e MILLUNI_ADMIN_PASSWORD.",
      "configuration_missing",
    );
  }

  const baseUrl = configuredBaseUrl();
  const sourceHeaders = {
    Origin: baseUrl,
    Referer: `${baseUrl}/off/pedidos`,
  };
  const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: {
      ...sourceHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ usuario: user, senha: password }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const loginBody = (await loginResponse.json().catch(() => null)) as {
    mudarSenha?: boolean;
  } | null;
  if (loginBody?.mudarSenha) {
    throw new MilluniSyncError(
      "A conta da Milluni exige a troca da senha antes da integração.",
      "password_change_required",
    );
  }
  if (!loginResponse.ok) {
    throw new MilluniSyncError(
      "A Milluni recusou as credenciais configuradas.",
      "authentication_failed",
    );
  }

  const cookie = responseCookies(loginResponse.headers);
  if (!cookie) {
    throw new MilluniSyncError(
      "A Milluni não devolveu uma sessão válida.",
      "authentication_failed",
    );
  }

  const ordersResponse = await fetch(`${baseUrl}/api/off/pedidos`, {
    headers: {
      ...sourceHeaders,
      Accept: "application/json",
      Cookie: cookie,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!ordersResponse.ok) {
    throw new MilluniSyncError(
      "Não foi possível obter os pedidos da Milluni.",
      "orders_unavailable",
    );
  }
  const body = await ordersResponse.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new MilluniSyncError(
      "A Milluni devolveu uma resposta inesperada.",
      "invalid_response",
    );
  }
  return body;
}

async function existingCustomers(
  workspaceId: string,
  emails: string[],
): Promise<Map<string, ExistingCustomer>> {
  const db = getDb();
  const rows: ExistingCustomer[] = [];
  for (const emailChunk of chunks(emails, QUERY_CHUNK_SIZE)) {
    const selected = await db
      .select({
        id: customers.id,
        email: customers.email,
        normalizedEmail: customers.normalizedEmail,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        normalizedPhone: customers.normalizedPhone,
        importedProductName: customers.importedProductName,
        tags: customers.tags,
        firstPurchaseAt: customers.firstPurchaseAt,
        lastPurchaseAt: customers.lastPurchaseAt,
        deletedAt: customers.deletedAt,
      })
      .from(customers)
      .where(
        and(
          eq(customers.workspaceId, workspaceId),
          or(
            inArray(customers.normalizedEmail, emailChunk),
            inArray(sql<string>`lower(trim(${customers.email}))`, emailChunk),
          ),
        ),
      );
    rows.push(...selected);
  }
  return new Map(
    rows.map((row) => [
      row.normalizedEmail ?? row.email.trim().toLowerCase(),
      row,
    ]),
  );
}

function isAlreadyCurrent(
  existing: ExistingCustomer,
  snapshot: MilluniCustomerSnapshot,
): boolean {
  const tags = Array.isArray(existing.tags) ? existing.tags : [];
  return (
    !existing.deletedAt &&
    tags.includes(SOURCE_TAG) &&
    tags.includes(CUSTOMER_IMPORT_STATUS_TAGS.paid) &&
    Boolean(existing.lastPurchaseAt) &&
    existing.lastPurchaseAt!.getTime() >= snapshot.lastPurchaseAt.getTime()
  );
}

function safePhone(phone: string | null): {
  phone: string | null;
  normalizedPhone: string | null;
} {
  if (!phone) return { phone: null, normalizedPhone: null };
  const normalizedPhone = normalizePhone(phone);
  return normalizedPhone
    ? { phone, normalizedPhone }
    : { phone: null, normalizedPhone: null };
}

/** Sincroniza compradores pagos sem criar pedidos ou lançamentos financeiros. */
export async function syncMilluniCustomers(
  workspaceId: string,
): Promise<MilluniSyncResult> {
  const payload = await fetchMilluniOrders();
  const normalized = normalizeMilluniCustomers(payload);
  const snapshots = normalized.customers;
  const existing = await existingCustomers(
    workspaceId,
    snapshots.map((snapshot) => snapshot.email),
  );
  const missing = snapshots.filter((snapshot) => !existing.has(snapshot.email));
  const changed = snapshots.filter((snapshot) => {
    const customer = existing.get(snapshot.email);
    return customer ? !isAlreadyCurrent(customer, snapshot) : false;
  });
  const unchanged = snapshots.length - missing.length - changed.length;
  const db = getDb();
  const inserted: Array<{ id: string; normalizedEmail: string | null }> = [];

  for (const batch of chunks(missing, INSERT_CHUNK_SIZE)) {
    const rows = await db
      .insert(customers)
      .values(
        batch.map((snapshot) => {
          const phone = safePhone(snapshot.phone);
          return {
            workspaceId,
            email: snapshot.email,
            normalizedEmail: snapshot.email,
            emailStatus: "valid",
            firstName: snapshot.firstName,
            lastName: snapshot.lastName,
            ...phone,
            country: "PT",
            source: "milluni",
            firstSource: "milluni",
            importedProductName: snapshot.productName,
            tags: mergeCustomerImportTags([], [SOURCE_TAG], "paid"),
            acceptsEmail: false,
            marketingOptOut: true,
            firstSeenAt: snapshot.firstPurchaseAt,
            lastActivityAt: snapshot.lastPurchaseAt,
            firstPurchaseAt: snapshot.firstPurchaseAt,
            lastPurchaseAt: snapshot.lastPurchaseAt,
          };
        }),
      )
      .onConflictDoNothing()
      .returning({
        id: customers.id,
        normalizedEmail: customers.normalizedEmail,
      });
    inserted.push(...rows);
  }

  const insertedByEmail = new Map(
    inserted
      .filter((row): row is { id: string; normalizedEmail: string } =>
        Boolean(row.normalizedEmail),
      )
      .map((row) => [row.normalizedEmail, row.id]),
  );
  const insertedSnapshots = missing.filter((snapshot) =>
    insertedByEmail.has(snapshot.email),
  );

  for (const batch of chunks(changed, 25)) {
    await Promise.all(
      batch.map(async (snapshot) => {
        const current = existing.get(snapshot.email)!;
        const phone = safePhone(snapshot.phone);
        const firstPurchaseAt =
          current.firstPurchaseAt &&
          current.firstPurchaseAt < snapshot.firstPurchaseAt
            ? current.firstPurchaseAt
            : snapshot.firstPurchaseAt;
        await db
          .update(customers)
          .set({
            normalizedEmail: snapshot.email,
            firstName: current.firstName || snapshot.firstName,
            lastName: current.lastName || snapshot.lastName,
            phone: current.phone || phone.phone,
            normalizedPhone: current.normalizedPhone || phone.normalizedPhone,
            importedProductName: snapshot.productName,
            tags: mergeCustomerImportTags(current.tags, [SOURCE_TAG], "paid"),
            firstPurchaseAt,
            lastPurchaseAt: snapshot.lastPurchaseAt,
            lastActivityAt: snapshot.lastPurchaseAt,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(customers.id, current.id),
              eq(customers.workspaceId, workspaceId),
            ),
          );
      }),
    );
  }

  const newAddresses = insertedSnapshots.flatMap((snapshot) => {
    const customerId = insertedByEmail.get(snapshot.email);
    if (!customerId || !snapshot.address) return [];
    return [
      {
        workspaceId,
        customerId,
        country: "PT",
        state: snapshot.address.state,
        city: snapshot.address.city,
        street: snapshot.address.street,
        postalCode: snapshot.address.postalCode,
        isDefault: true,
      },
    ];
  });
  for (const batch of chunks(newAddresses, INSERT_CHUNK_SIZE)) {
    await db.insert(customerAddresses).values(batch);
  }

  const activities = [
    ...insertedSnapshots.map((snapshot) => ({
      workspaceId,
      customerId: insertedByEmail.get(snapshot.email)!,
      type: "customer_imported",
      source: "milluni",
      metadata: {
        sourceOrderId: snapshot.sourceOrderId,
        sourceReference: snapshot.sourceReference,
        productName: snapshot.productName,
      },
    })),
    ...changed.map((snapshot) => ({
      workspaceId,
      customerId: existing.get(snapshot.email)!.id,
      type: "payment_approved",
      source: "milluni",
      metadata: {
        sourceOrderId: snapshot.sourceOrderId,
        sourceReference: snapshot.sourceReference,
        productName: snapshot.productName,
      },
    })),
  ];
  for (const batch of chunks(activities, INSERT_CHUNK_SIZE)) {
    await db.insert(customerActivities).values(batch);
  }

  return {
    scannedOrders: normalized.scannedOrders,
    paidOrders: normalized.paidOrders,
    uniqueCustomers: snapshots.length,
    imported: insertedSnapshots.length,
    updated: changed.length,
    unchanged: unchanged + (missing.length - insertedSnapshots.length),
    invalidPaidOrders: normalized.invalidPaidOrders,
  };
}
