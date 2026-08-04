import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, orderItems, orders, payments } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { CATEGORY_LABEL, PAYMENT_METHOD_LABEL, resolveCartCategory } from "@/features/carts/status";
import { listCarts } from "@/features/carts/queries";
import { parseCartFilters } from "@/app/api/carrinhos/filters";
import { maskDocument } from "@/lib/mask";
import { recordAuditLog } from "@/features/audit/log";

export const dynamic = "force-dynamic";

/** Teto do export por filtro — protege memória da função serverless. */
const MAX_FILTERED_EXPORT = 5_000;

const bodySchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  /** Query string dos filtros da página, quando se exporta tudo o que está filtrado. */
  filters: z.string().max(2000).optional(),
});

function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const HEADER = [
  "referencia",
  "nome",
  "email",
  "telefone",
  "cpf",
  "produto",
  "quantidade",
  "valor",
  "moeda",
  "status",
  "pagamento",
  "checkout_url",
  "ultimo_lembrete",
  "lembretes_enviados",
  "data_criacao",
  "data_atualizacao",
];

interface ExportRow {
  reference: string;
  name: string;
  email: string;
  phone: string;
  document: string | null;
  product: string;
  quantity: number;
  totalCents: number;
  currency: string;
  status: string;
  method: string;
  checkoutUrl: string;
  lastReminderSentAt: string;
  reminderCount: number;
  createdAt: string;
  updatedAt: string;
}

function toCsv(rows: ExportRow[]): string {
  const lines = [HEADER.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.reference,
        r.name,
        r.email,
        r.phone,
        // Documento sempre mascarado: não há sistema de permissões granular
        // hoje para autorizar um export com dado sensível completo.
        maskDocument(r.document),
        r.product,
        String(r.quantity),
        (r.totalCents / 100).toFixed(2),
        r.currency,
        r.status,
        r.method,
        r.checkoutUrl,
        r.lastReminderSentAt,
        String(r.reminderCount),
        r.createdAt,
        r.updatedAt,
      ]
        .map((v) => csvEscape(String(v)))
        .join(";"),
    );
  }
  // BOM no início — Excel só reconhece UTF-8 automaticamente com ele.
  return `﻿${lines.join("\n")}`;
}

function csvResponse(csv: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carrinhos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

/**
 * Exporta carrinhos em CSV — os selecionados (`orderIds`) ou todos os que
 * correspondem aos filtros atuais da página (`filters`, a query string da
 * listagem). Documento sempre mascarado no arquivo.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success || (!parsed.data.orderIds && parsed.data.filters === undefined)) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  // Export por filtro: reaproveita `listCarts`, que já monta produto,
  // pagamento e categoria de cada linha — nenhuma lógica duplicada aqui.
  if (!parsed.data.orderIds) {
    const filters = parseCartFilters(new URLSearchParams(parsed.data.filters ?? ""));
    const list = await listCarts({ ...filters, page: 1, pageSize: MAX_FILTERED_EXPORT });

    const rows: ExportRow[] = list.rows.map((r) => ({
      reference: r.reference,
      name: r.customerName ?? "",
      email: r.customerEmail ?? "",
      phone: r.customerPhone ?? "",
      document: r.customerDocument,
      product: r.productName ?? "",
      quantity: r.quantity ?? 1,
      totalCents: r.totalCents,
      currency: r.currency,
      status: CATEGORY_LABEL[r.category],
      method: r.paymentMethod ? (PAYMENT_METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod) : "",
      checkoutUrl: r.checkoutUrl ?? "",
      lastReminderSentAt: r.lastReminderSentAt ? new Date(r.lastReminderSentAt).toISOString() : "",
      reminderCount: r.reminderCount,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));

    await recordAuditLog({
      action: "cart.exported",
      entityType: "order",
      changes: { count: rows.length, scope: "filtered" },
    });

    return csvResponse(toCsv(rows));
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const { orderIds } = parsed.data;

  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      totalCents: orders.totalCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      checkoutUrl: orders.checkoutUrl,
      lastReminderSentAt: orders.lastReminderSentAt,
      reminderCount: orders.reminderCount,
      recoveredManuallyAt: orders.recoveredManuallyAt,
      customerFirst: customers.firstName,
      customerLast: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerDocument: customers.document,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.workspaceId, workspaceId), inArray(orders.id, orderIds)));

  const matchedIds = rows.map((r) => r.id);

  const [itemRows, paymentRows] = await Promise.all([
    matchedIds.length > 0
      ? db
          .select({
            orderId: orderItems.orderId,
            productName: orderItems.productName,
            quantity: orderItems.quantity,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, matchedIds))
      : Promise.resolve([]),
    matchedIds.length > 0
      ? db
          .select({ orderId: payments.orderId, method: payments.method })
          .from(payments)
          .where(inArray(payments.orderId, matchedIds))
      : Promise.resolve([]),
  ]);

  const itemByOrder = new Map<string, { productName: string; quantity: number }>();
  for (const r of itemRows) {
    if (!itemByOrder.has(r.orderId)) {
      itemByOrder.set(r.orderId, { productName: r.productName, quantity: r.quantity });
    }
  }
  const methodByOrder = new Map<string, string>();
  for (const r of paymentRows) {
    if (!methodByOrder.has(r.orderId)) methodByOrder.set(r.orderId, r.method);
  }

  const exportRows: ExportRow[] = rows.map((r) => {
    const hoursSinceUpdate = (Date.now() - new Date(r.updatedAt).getTime()) / 3_600_000;
    const category = resolveCartCategory(r.status, hoursSinceUpdate, r.recoveredManuallyAt);
    const item = itemByOrder.get(r.id);
    const method = methodByOrder.get(r.id);

    return {
      reference: r.reference,
      name: [r.customerFirst, r.customerLast].filter(Boolean).join(" "),
      email: r.customerEmail ?? "",
      phone: r.customerPhone ?? "",
      document: r.customerDocument,
      product: item?.productName ?? "",
      quantity: item?.quantity ?? 1,
      totalCents: Number(r.totalCents),
      currency: r.currency,
      status: CATEGORY_LABEL[category],
      method: method ? (PAYMENT_METHOD_LABEL[method] ?? method) : "",
      checkoutUrl: r.checkoutUrl ?? "",
      lastReminderSentAt: r.lastReminderSentAt ? r.lastReminderSentAt.toISOString() : "",
      reminderCount: r.reminderCount,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  await recordAuditLog({
    action: "cart.exported",
    entityType: "order",
    changes: { count: exportRows.length, scope: "selection" },
  });

  return csvResponse(toCsv(exportRows));
}
