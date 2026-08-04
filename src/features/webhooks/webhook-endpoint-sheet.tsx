"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Webhook as WebhookIcon,
} from "lucide-react";

import {
  createWebhookEndpointAction,
  updateWebhookEndpointAction,
  type WebhookActionResult,
} from "@/features/webhooks/actions";
import { WebhookEventsGrid } from "@/features/webhooks/webhook-events-grid";
import type { WebhookEndpointRow } from "@/features/webhooks/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface WebhookEndpointSheetProps {
  /** Ausente = modo criação. */
  endpoint?: WebhookEndpointRow;
  trigger?: React.ReactNode;
}

export function WebhookEndpointSheet({
  endpoint,
  trigger,
}: WebhookEndpointSheetProps) {
  const isEdit = Boolean(endpoint);
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<string[]>(endpoint?.events ?? []);
  const [isActive, setIsActive] = React.useState(endpoint?.isActive ?? true);

  const action = isEdit
    ? updateWebhookEndpointAction
    : createWebhookEndpointAction;
  const [state, formAction, pending] = useActionState<
    WebhookActionResult | null,
    FormData
  >(action, null);

  const [handledState, setHandledState] = React.useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> Novo Webhook
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <WebhookIcon className="size-4" aria-hidden="true" />
            {isEdit ? "Editar webhook" : "Novo webhook"}
          </SheetTitle>
          <SheetDescription>
            Escolha os eventos que devem disparar uma chamada para a sua URL.
          </SheetDescription>
        </SheetHeader>

        <form
          action={formAction}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          {isEdit && <input type="hidden" name="id" value={endpoint!.id} />}

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && state.message && (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              defaultValue={endpoint?.name}
              placeholder="Ex.: Integração com CRM"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL de destino</Label>
            <Input
              id="url"
              name="url"
              type="url"
              defaultValue={endpoint?.url}
              placeholder="https://exemplo.com/webhook"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-primary size-4"
            />
            Webhook ativo
          </label>

          <div className="space-y-2">
            <Label>Eventos</Label>
            <WebhookEventsGrid selected={events} onChange={setEvents} />
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" loading={pending}>
              {isEdit ? "Salvar alterações" : "Criar webhook"}
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
