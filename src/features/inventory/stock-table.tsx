import Image from "next/image";
import { Package } from "lucide-react";

import { formatNumber } from "@/lib/format";
import {
  STOCK_STATUS_LABEL,
  STOCK_STATUS_VARIANT,
} from "@/features/inventory/status";
import type { InventoryProductRow } from "@/features/inventory/queries";
import { Badge } from "@/components/ui/badge";
import { AdjustStockSheet } from "@/features/inventory/adjust-stock-sheet";

export function StockTable({ products }: { products: InventoryProductRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th scope="col" className="pr-3 pb-2.5 font-medium">
              Produto
            </th>
            <th scope="col" className="pr-3 pb-2.5 text-right font-medium">
              Estoque
            </th>
            <th scope="col" className="pr-3 pb-2.5 text-right font-medium">
              Alerta mínimo
            </th>
            <th scope="col" className="pr-3 pb-2.5 text-right font-medium">
              Vendidos (30d)
            </th>
            <th scope="col" className="pr-3 pb-2.5 font-medium">
              Estado
            </th>
            <th scope="col" className="pb-2.5 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.id}
              className="hover:bg-muted/40 border-b transition-colors last:border-0"
            >
              <td className="py-3 pr-3">
                <div className="flex items-center gap-3">
                  <div className="bg-muted relative size-9 shrink-0 overflow-hidden rounded-lg">
                    {p.mainImageUrl ? (
                      <Image
                        src={p.mainImageUrl}
                        alt={p.name}
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground flex h-full items-center justify-center">
                        <Package className="size-4" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="max-w-[220px] truncate font-medium">
                      {p.name}
                    </p>
                    {p.sku && (
                      <p className="text-muted-foreground text-xs">{p.sku}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="py-3 pr-3 text-right font-semibold">
                {formatNumber(p.stockQuantity)}
              </td>
              <td className="text-muted-foreground py-3 pr-3 text-right">
                {p.minStockAlert !== null ? formatNumber(p.minStockAlert) : "—"}
              </td>
              <td className="text-muted-foreground py-3 pr-3 text-right">
                {formatNumber(p.soldLast30d)}
              </td>
              <td className="py-3 pr-3">
                <Badge variant={STOCK_STATUS_VARIANT[p.status]}>
                  {STOCK_STATUS_LABEL[p.status]}
                </Badge>
              </td>
              <td className="py-3">
                <AdjustStockSheet product={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
