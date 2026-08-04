import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  inventoryMovements,
  orderItems,
  orders,
  products,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { classifyStock, type StockStatus } from "@/features/inventory/status";

const PAID_SQL = sql`${orders.status} in ('paid','shipped','delivered')`;

export interface InventoryProductRow {
  id: string;
  name: string;
  sku: string | null;
  mainImageUrl: string | null;
  stockQuantity: number;
  minStockAlert: number | null;
  status: StockStatus;
  /** Unidades vendidas (pedidos pagos) nos últimos 30 dias. */
  soldLast30d: number;
}

export interface InventorySummary {
  trackedCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  totalUnits: number;
}

/** Produtos do workspace com controle de estoque ativado. */
export async function listInventoryProducts(): Promise<InventoryProductRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      mainImageUrl: products.mainImageUrl,
      stockQuantity: products.stockQuantity,
      minStockAlert: products.minStockAlert,
      soldLast30d: sql<number>`coalesce(sum(${orderItems.quantity}) filter (
        where ${PAID_SQL} and ${orders.createdAt} >= now() - interval '30 days'
      ), 0)::int`,
    })
    .from(products)
    .leftJoin(orderItems, eq(orderItems.productId, products.id))
    .leftJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(products.workspaceId, workspaceId),
        eq(products.trackInventory, true),
        sql`${products.deletedAt} is null`,
      ),
    )
    .groupBy(
      products.id,
      products.name,
      products.sku,
      products.mainImageUrl,
      products.stockQuantity,
      products.minStockAlert,
    )
    .orderBy(products.name);

  return rows.map((r) => ({
    ...r,
    status: classifyStock(r.stockQuantity, r.minStockAlert),
  }));
}

export function summarizeInventory(
  rows: InventoryProductRow[],
): InventorySummary {
  return {
    trackedCount: rows.length,
    outOfStockCount: rows.filter((r) => r.status === "out_of_stock").length,
    lowStockCount: rows.filter((r) => r.status === "low_stock").length,
    totalUnits: rows.reduce((sum, r) => sum + r.stockQuantity, 0),
  };
}

export interface InventoryMovementRow {
  id: string;
  quantity: number;
  reason: string;
  note: string | null;
  createdAt: Date;
}

/** Histórico de movimentações de um produto, mais recente primeiro. */
export async function listInventoryMovements(
  productId: string,
  limit = 20,
): Promise<InventoryMovementRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: inventoryMovements.id,
      quantity: inventoryMovements.quantity,
      reason: inventoryMovements.reason,
      note: inventoryMovements.note,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.workspaceId, workspaceId),
        eq(inventoryMovements.productId, productId),
      ),
    )
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit);

  return rows;
}
