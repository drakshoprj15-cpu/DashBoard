"use client";

import * as React from "react";
import { AlertTriangle, XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sending: boolean;
  error?: string;
  onConfirm: (reason: string) => void;
}

/**
 * Cancelamento administrativo — sempre exige motivo e confirmação. Nunca
 * oferece "Pago" como opção: essa transição só acontece via gateway.
 */
export function CancelOrderDialog({ open, onOpenChange, sending, error, onConfirm }: CancelOrderDialogProps) {
  const [reason, setReason] = React.useState("");

  // Limpa o motivo ao fechar — ajuste síncrono durante a renderização, não em efeito.
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setReason("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <XCircle className="size-4" aria-hidden="true" />
            Cancelar pedido
          </SheetTitle>
          <SheetDescription>
            Marca o pedido como cancelado. Isto não afeta um pagamento já aprovado — “Pago” só é definido pela
            confirmação real do gateway.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Motivo do cancelamento</Label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente pediu para cancelar, referência expirada há semanas..."
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="destructive"
            loading={sending}
            disabled={reason.trim().length < 5}
            onClick={() => onConfirm(reason)}
          >
            <XCircle /> Confirmar cancelamento
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
