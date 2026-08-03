import { and, eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  inventoryMovements,
  orderItems,
  productVariants,
  products,
} from "@/database/schema";

/**
 * Baixa e devolução de estoque por variação.
 *
 * A baixa acontece **na confirmação do pagamento**, nunca no clique do
 * cliente: pedido criado e não pago não pode segurar unidade de ninguém. O
 * webhook do gateway é a única origem, e cada movimento fica registrado em
 * `inventory_movements` para o histórico bater com o saldo.
 */

/** Já existe movimento desta razão para este pedido? Evita baixa dupla. */
async function hasMovement(orderId: string, reason: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.referenceId, orderId),
        eq(inventoryMovements.reason, reason),
      ),
    );

  return (row?.total ?? 0) > 0;
}

/**
 * Desconta do estoque o que foi vendido num pedido pago.
 *
 * Tudo numa transação: ou o saldo e o histórico mudam juntos, ou nada muda.
 * O `greatest(..., 0)` impede saldo negativo mesmo em corrida entre dois
 * pagamentos simultâneos da última unidade.
 */
export async function applyPaidOrderStock(orderId: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (await hasMovement(orderId, "sale")) return;

  const db = getDb();

  const items = await db
    .select({
      workspaceId: orderItems.workspaceId,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      quantity: orderItems.quantity,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (items.length === 0) return;

  await db.transaction(async (tx) => {
    for (const item of items) {
      if (!item.productId) continue;

      if (item.variantId) {
        const [variant] = await tx
          .select({
            trackInventory: productVariants.trackInventory,
          })
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .limit(1);

        if (!variant?.trackInventory) continue;

        await tx
          .update(productVariants)
          .set({
            stockQuantity: sql`greatest(${productVariants.stockQuantity} - ${item.quantity}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, item.variantId));
      } else {
        const [product] = await tx
          .select({ trackInventory: products.trackInventory })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (!product?.trackInventory) continue;

        await tx
          .update(products)
          .set({
            stockQuantity: sql`greatest(${products.stockQuantity} - ${item.quantity}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));
      }

      await tx.insert(inventoryMovements).values({
        workspaceId: item.workspaceId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: -item.quantity,
        reason: "sale",
        referenceId: orderId,
        note: item.variantName
          ? `${item.productName} — ${item.variantName}`
          : item.productName,
      });
    }
  });
}

/**
 * Devolve ao estoque o que foi reembolsado ou perdido em chargeback.
 * Só age se a venda tiver mesmo dado baixa — senão devolveria unidade que
 * nunca saiu.
 */
export async function restoreOrderStock(
  orderId: string,
  reason: "refund" | "chargeback",
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (!(await hasMovement(orderId, "sale"))) return;
  if (await hasMovement(orderId, reason)) return;

  const db = getDb();

  const items = await db
    .select({
      workspaceId: orderItems.workspaceId,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      quantity: orderItems.quantity,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  await db.transaction(async (tx) => {
    for (const item of items) {
      if (!item.productId) continue;

      if (item.variantId) {
        await tx
          .update(productVariants)
          .set({
            stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(productVariants.id, item.variantId),
              eq(productVariants.trackInventory, true),
            ),
          );
      } else {
        await tx
          .update(products)
          .set({
            stockQuantity: sql`${products.stockQuantity} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, item.productId),
              eq(products.trackInventory, true),
            ),
          );
      }

      await tx.insert(inventoryMovements).values({
        workspaceId: item.workspaceId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        reason,
        referenceId: orderId,
        note: item.variantName
          ? `${item.productName} — ${item.variantName}`
          : item.productName,
      });
    }
  });
}
