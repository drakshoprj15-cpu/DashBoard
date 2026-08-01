"use client";

import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface BulkReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientsCount: number;
  matchedTotal?: number;
  statusesLabel: string;
  sending: boolean;
  onConfirm: () => void;
}

/**
 * Confirmação antes de qualquer disparo em massa — mostra quantidade,
 * status incluídos e o que será usado como modelo, antes de enviar de fato.
 */
export function BulkReminderDialog({
  open,
  onOpenChange,
  recipientsCount,
  matchedTotal,
  statusesLabel,
  sending,
  onConfirm,
}: BulkReminderDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Mail className="size-4" aria-hidden="true" />
            Enviar lembrete de pagamento
          </SheetTitle>
          <SheetDescription>Revise antes de enviar — nada é disparado automaticamente.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div className="bg-muted/50 space-y-2 rounded-lg border p-3 text-sm">
            <p>
              <span className="font-semibold">{recipientsCount}</span> destinatário
              {recipientsCount === 1 ? "" : "s"} elegíve{recipientsCount === 1 ? "l" : "is"} para receber o lembrete.
            </p>
            {typeof matchedTotal === "number" && matchedTotal > recipientsCount && (
              <p className="text-muted-foreground text-xs">
                {matchedTotal} carrinhos encontram-se nesses status; o envio foi limitado a {recipientsCount} por
                disparo.
              </p>
            )}
            <p className="text-muted-foreground text-xs">Status incluídos: {statusesLabel}</p>
            <p className="text-muted-foreground text-xs">
              Modelo: e-mail padrão de lembrete de pagamento pendente (transacional).
            </p>
            <p className="text-muted-foreground text-xs">
              Clientes sem consentimento, bloqueados, suprimidos ou lembrados recentemente são excluídos
              automaticamente — o resultado final aparece após o envio.
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button type="button" loading={sending} disabled={recipientsCount === 0} onClick={onConfirm}>
            <Mail /> Revisar e continuar
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
