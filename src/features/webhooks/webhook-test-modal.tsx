"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, FlaskConical } from "lucide-react";

import {
  sendTestWebhookAction,
  type TestWebhookResult,
} from "@/features/webhooks/actions";
import { WEBHOOK_EVENTS } from "@/features/webhooks/events-catalog";
import { formatNumber } from "@/lib/format";
import type { WebhookEndpointRow } from "@/features/webhooks/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function WebhookTestModal({
  endpoint,
}: {
  endpoint: WebhookEndpointRow;
}) {
  const [open, setOpen] = React.useState(false);
  const [event, setEvent] = React.useState(
    endpoint.events[0] ?? WEBHOOK_EVENTS[0].key,
  );
  const [state, formAction, pending] = useActionState<
    TestWebhookResult | null,
    FormData
  >(sendTestWebhookAction, null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <FlaskConical /> Testar
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Enviar teste</SheetTitle>
          <SheetDescription>{endpoint.name}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={endpoint.id} />

            <div className="space-y-2">
              <Label htmlFor="event">Evento</Label>
              <select
                id="event"
                name="event"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                {(endpoint.events.length > 0
                  ? endpoint.events
                  : WEBHOOK_EVENTS.map((e) => e.key)
                ).map((key) => (
                  <option key={key} value={key}>
                    {WEBHOOK_EVENTS.find((e) => e.key === key)?.label ?? key}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" loading={pending} className="w-full">
              Enviar teste
            </Button>
          </form>

          {state && (
            <div className="space-y-3 border-t pt-4">
              {state.ok ? (
                <Alert variant="success">
                  <CheckCircle2 />
                  <AlertDescription>
                    Respondeu com sucesso em{" "}
                    {formatNumber(state.durationMs ?? 0)}ms.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>
                    {state.error ?? "O destino não respondeu com sucesso."}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Status HTTP
                </p>
                <p className="font-mono text-sm">{state.httpStatus ?? "—"}</p>
              </div>

              {state.requestBody && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Corpo enviado
                  </p>
                  <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-[11px]">
                    {JSON.stringify(JSON.parse(state.requestBody), null, 2)}
                  </pre>
                </div>
              )}

              {state.responseBody && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Resposta recebida
                  </p>
                  <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-[11px] break-all whitespace-pre-wrap">
                    {state.responseBody}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
