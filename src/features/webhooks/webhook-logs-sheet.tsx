"use client";

import * as React from "react";

import { formatDateTime, formatNumber } from "@/lib/format";
import { eventLabel } from "@/features/webhooks/events-catalog";
import { DeliveryStatusBadge } from "@/features/webhooks/webhook-status-badge";
import type { WebhookDeliveryRow, WebhookEndpointRow } from "@/features/webhooks/queries";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function LogDetail({ delivery }: { delivery: WebhookDeliveryRow }) {
  return (
    <div className="space-y-2 border-t py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{eventLabel(delivery.eventType)}</span>
        <DeliveryStatusBadge status={delivery.status} />
      </div>
      <p className="text-muted-foreground text-xs">
        {formatDateTime(delivery.createdAt, "pt-PT")} · {delivery.attempts} tentativa(s) ·{" "}
        {delivery.durationMs !== null ? `${formatNumber(delivery.durationMs)}ms` : "—"} · HTTP{" "}
        {delivery.httpStatus ?? "—"}
      </p>
      <details className="text-xs">
        <summary className="text-primary cursor-pointer">Ver payload e resposta</summary>
        <div className="mt-2 space-y-2">
          <div>
            <p className="text-muted-foreground mb-1 font-medium">Payload</p>
            <pre className="bg-muted max-h-32 overflow-auto rounded-md p-2 text-[11px]">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>
          {delivery.responseBody && (
            <div>
              <p className="text-muted-foreground mb-1 font-medium">Resposta</p>
              <pre className="bg-muted max-h-32 overflow-auto rounded-md p-2 text-[11px] break-all whitespace-pre-wrap">
                {delivery.responseBody}
              </pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export function WebhookLogsSheet({
  endpoint,
  trigger,
}: {
  endpoint: WebhookEndpointRow;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [deliveries, setDeliveries] = React.useState<WebhookDeliveryRow[] | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let active = true;

    async function fetchDeliveries() {
      if (active) setDeliveries(null);
      try {
        const res = await fetch(`/api/webhooks-config?endpointId=${endpoint.id}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { deliveries: WebhookDeliveryRow[] };
        if (active) setDeliveries(json.deliveries);
      } catch {
        if (active) setDeliveries([]);
      }
    }

    fetchDeliveries();
    return () => {
      active = false;
    };
  }, [open, endpoint.id]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Histórico de entregas</SheetTitle>
          <SheetDescription>{endpoint.name}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {deliveries === null ? (
            <p className="text-muted-foreground py-6 text-center text-xs">A carregar…</p>
          ) : deliveries.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              Sem entregas registadas ainda.
            </p>
          ) : (
            deliveries.map((d) => <LogDetail key={d.id} delivery={d} />)
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
