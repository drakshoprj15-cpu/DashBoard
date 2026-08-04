"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";

import {
  createManualLedgerEntryAction,
  type LedgerActionResult,
} from "@/features/ledger/actions";
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

export function NewEntrySheet() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<
    LedgerActionResult | null,
    FormData
  >(createManualLedgerEntryAction, null);

  // Fecha o sheet assim que a action responder com sucesso — ajustado
  // durante a renderização (não num efeito) para evitar um render em
  // cascata, mesmo padrão já usado em CheckoutThemeSheet.
  const [handledState, setHandledState] = React.useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus /> Novo lançamento
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo lançamento</SheetTitle>
          <SheetDescription>
            Entrada ou saída manual no livro-caixa
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col gap-4 px-4">
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
            <Label htmlFor="type">Tipo</Label>
            <select
              id="type"
              name="type"
              defaultValue="manual_in"
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            >
              <option value="manual_in">Entrada</option>
              <option value="manual_out">Saída</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              name="description"
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">
              Categoria{" "}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              id="category"
              name="category"
              maxLength={80}
              placeholder="Ex.: Taxa, Frete, Publicidade"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Valor</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" loading={pending}>
              Registar lançamento
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
