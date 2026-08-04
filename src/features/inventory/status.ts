/**
 * Classificação de estoque — fonte única usada pela página de Estoque e
 * pelos alertas operacionais da Dashboard. Mantém a mesma regra nos dois
 * lugares em vez de repetir a condição.
 */

export type StockStatus = "out_of_stock" | "low_stock" | "ok";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  out_of_stock: "Esgotado",
  low_stock: "Estoque baixo",
  ok: "Normal",
};

export const STOCK_STATUS_VARIANT: Record<
  StockStatus,
  "destructive" | "warning" | "success"
> = {
  out_of_stock: "destructive",
  low_stock: "warning",
  ok: "success",
};

export function classifyStock(
  stockQuantity: number,
  minStockAlert: number | null,
): StockStatus {
  if (stockQuantity <= 0) return "out_of_stock";
  if (minStockAlert !== null && stockQuantity <= minStockAlert)
    return "low_stock";
  return "ok";
}
