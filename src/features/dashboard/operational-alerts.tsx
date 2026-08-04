import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  PackageX,
  ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatNumber } from "@/lib/format";
import type { OperationalAlert } from "@/features/dashboard/queries";

const ICON_BY_KEY: Record<string, LucideIcon> = {
  pending_payments: Clock,
  awaiting_shipment: ShoppingCart,
  low_stock: Package,
  out_of_stock: PackageX,
  abandoned_carts: AlertTriangle,
};

export interface OperationalAlertsProps {
  alerts: OperationalAlert[];
}

export function OperationalAlerts({ alerts }: OperationalAlertsProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 py-4">
        <CheckCircle2
          className="text-success size-8 shrink-0"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium">Tudo certo por aqui</p>
          <p className="text-muted-foreground text-xs">
            Nenhuma pendência importante encontrada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {alerts.map((a) => {
        const Icon = ICON_BY_KEY[a.key] ?? AlertTriangle;
        return (
          <li key={a.key}>
            <Link
              href={a.href}
              className="hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
            >
              <Icon
                className="text-warning size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium">{a.title}</span>
              <span className="text-muted-foreground text-xs font-semibold">
                {formatNumber(a.count)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
