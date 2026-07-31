"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { inventoryMovements, products } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { recordAuditLog } from "@/features/audit/log";
import {
  adjustStockSchema,
  updateMinStockSchema,
} from "@/validations/inventory";

export interface InventoryActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Ajusta o estoque de um produto e registra a movimentação, em transação —
 * o saldo em `products.stockQuantity` e o histórico em `inventory_movements`
 * nunca podem divergir. Nunca deixa o estoque ir a negativo.
 */
export async function adjustStockAction(
  _prev: InventoryActionResult | null,
  formData: FormData,
): Promise<InventoryActionResult> {
  const parsed = adjustStockSchema.safeParse({
    productId: formData.get("productId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const { productId, type, quantity, note } = parsed.data;
  // Entrada soma, saída subtrai; correção usa o sinal informado pelo usuário.
  const delta =
    type === "restock" ? Math.abs(quantity) : type === "adjustment" ? -Math.abs(quantity) : quantity;

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ stockQuantity: products.stockQuantity, trackInventory: products.trackInventory })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.workspaceId, workspaceId)))
        .limit(1)
        .for("update");

      if (!product) {
        return { ok: false as const, error: "Produto não encontrado." };
      }
      if (!product.trackInventory) {
        return { ok: false as const, error: "Este produto não tem controle de estoque ativado." };
      }

      const newQuantity = product.stockQuantity + delta;
      if (newQuantity < 0) {
        return {
          ok: false as const,
          error: `Estoque insuficiente: há ${product.stockQuantity} unidade(s), a saída pediria ${Math.abs(delta)}.`,
        };
      }

      await tx
        .update(products)
        .set({ stockQuantity: newQuantity, updatedAt: new Date() })
        .where(eq(products.id, productId));

      await tx.insert(inventoryMovements).values({
        workspaceId,
        productId,
        quantity: delta,
        reason: type,
        note: note || null,
      });

      return { ok: true as const, newQuantity };
    });

    if (!result.ok) return result;

    await recordAuditLog({
      action: "inventory.adjusted",
      entityType: "inventory",
      entityId: productId,
      changes: { type, delta, newQuantity: result.newQuantity, note: note || undefined },
    });

    revalidatePath("/catalogo/estoque");
    return { ok: true, message: "Estoque atualizado." };
  } catch (error) {
    console.error("[inventory] erro ao ajustar estoque:", error);
    return { ok: false, error: "Não foi possível ajustar o estoque." };
  }
}

export async function updateMinStockAction(
  _prev: InventoryActionResult | null,
  formData: FormData,
): Promise<InventoryActionResult> {
  const rawMin = formData.get("minStockAlert");

  const parsed = updateMinStockSchema.safeParse({
    productId: formData.get("productId"),
    minStockAlert: rawMin === "" ? undefined : rawMin,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const { productId, minStockAlert } = parsed.data;

    const [row] = await db
      .update(products)
      .set({
        minStockAlert: rawMin === "" ? null : (minStockAlert ?? null),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), eq(products.workspaceId, workspaceId)))
      .returning({ id: products.id });

    if (!row) return { ok: false, error: "Produto não encontrado." };

    await recordAuditLog({
      action: "inventory.min_stock_updated",
      entityType: "inventory",
      entityId: productId,
      changes: { minStockAlert: rawMin === "" ? null : (minStockAlert ?? null) },
    });

    revalidatePath("/catalogo/estoque");
    return { ok: true, message: "Alerta de estoque mínimo atualizado." };
  } catch (error) {
    console.error("[inventory] erro ao atualizar estoque mínimo:", error);
    return { ok: false, error: "Não foi possível atualizar o alerta." };
  }
}

