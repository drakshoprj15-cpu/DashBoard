"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Palette } from "lucide-react";

import {
  updateCheckoutThemeAction,
  type CheckoutActionResult,
} from "@/features/checkouts/actions";
import type { CheckoutTheme } from "@/features/checkouts/queries";
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

function ColorField({
  id,
  name,
  label,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-input size-9 shrink-0 cursor-pointer rounded-md border p-0.5"
        />
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#7c3aed"
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export function CheckoutThemeSheet({
  checkoutId,
  checkoutName,
  theme,
}: {
  checkoutId: string;
  checkoutName: string;
  theme: CheckoutTheme;
}) {
  const [open, setOpen] = React.useState(false);
  const [primaryColor, setPrimaryColor] = React.useState(theme.primaryColor);
  const [buttonColor, setButtonColor] = React.useState(theme.buttonColor);
  const [state, formAction, pending] = useActionState<
    CheckoutActionResult | null,
    FormData
  >(updateCheckoutThemeAction, null);

  // Fecha o sheet assim que a action responder com sucesso — ajustado durante
  // a renderização (não num efeito) para evitar um render em cascata.
  const [handledState, setHandledState] = React.useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="Personalizar cores">
          <Palette />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Personalizar cores</SheetTitle>
          <SheetDescription>{checkoutName}</SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col gap-4 px-4">
          <input type="hidden" name="id" value={checkoutId} />

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

          <ColorField
            id={`primaryColor-${checkoutId}`}
            name="primaryColor"
            label="Cor de destaque"
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <ColorField
            id={`buttonColor-${checkoutId}`}
            name="buttonColor"
            label="Cor do botão de pagamento"
            value={buttonColor}
            onChange={setButtonColor}
          />

          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground mb-3 text-xs">Pré-visualização</p>
            <div
              className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              1
            </div>
            <button
              type="button"
              className="mt-3 h-10 w-full rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: buttonColor }}
            >
              Pagar agora
            </button>
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" loading={pending}>
              Salvar cores
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
