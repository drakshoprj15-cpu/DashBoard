import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, orderItems, orders, payments } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { CATEGORY_LABEL, PAYMENT_METHOD_LABEL, resolveCartCategory } from "@/features/carts/status";
import { maskDocument } from "@/lib/mask";
import { recordAuditLog } from "@/features/audit/log";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
});

function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Exporta os carrinhos selecionados em CSV. Documento (CPF/NIF) sempre
 * mascarado no arquivo — não há sistema de permissões granular hoje para
 * autorizar um export com dado sensível completo com segurança.
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
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
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
      paidAt: orders.paidAt,
      updatedAt: orders.updatedAt,
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
          .select({ orderId: orderItems.orderId, productName: orderItems.productName })
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

  const productByOrder = new Map<string, string>();
  for (const r of itemRows) {
    if (!productByOrder.has(r.orderId)) productByOrder.set(r.orderId, r.productName);
  }
  const methodByOrder = new Map<string, string>();
  for (const r of paymentRows) {
    if (!methodByOrder.has(r.orderId)) methodByOrder.set(r.orderId, r.method);
  }

  const header = [
    "Referência",
    "Cliente",
    "E-mail",
    "Telefone",
    "Documento",
    "Produto",
    "Valor",
    "Moeda",
    "Status",
    "Pagamento",
    "Criado em",
    "Pago em",
  ];

  const lines = [header.join(";")];

  for (const r of rows) {
    const hoursSinceUpdate = (Date.now() - new Date(r.updatedAt).getTime()) / 3_600_000;
    const category = resolveCartCategory(r.status, hoursSinceUpdate);
    const name = [r.customerFirst, r.customerLast].filter(Boolean).join(" ") || "—";
    const method = methodByOrder.get(r.id);
    const line = [
      r.reference,
      name,
      r.customerEmail ?? "",
      r.customerPhone ?? "",
      maskDocument(r.customerDocument),
      productByOrder.get(r.id) ?? "",
      (Number(r.totalCents) / 100).toFixed(2),
      r.currency,
      CATEGORY_LABEL[category],
      method ? (PAYMENT_METHOD_LABEL[method] ?? method) : "",
      r.createdAt.toISOString(),
      r.paidAt ? r.paidAt.toISOString() : "",
    ];
    lines.push(line.map((v) => csvEscape(String(v))).join(";"));
  }

  await recordAuditLog({
    action: "cart.exported",
    entityType: "order",
    changes: { count: rows.length },
  });

  // BOM no início — Excel só reconhece UTF-8 automaticamente com ele.
  const csv = `﻿${lines.join("\n")}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carrinhos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
