"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, PackagePlus } from "lucide-react";

import {
  adjustStockAction,
  updateMinStockAction,
  type InventoryActionResult,
} from "@/features/inventory/actions";
import {
  MOVEMENT_TYPE_LABEL,
  type MovementType,
} from "@/validations/inventory";
import type {
  InventoryMovementRow,
  InventoryProductRow,
} from "@/features/inventory/queries";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

const MOVEMENT_TYPES = Object.entries(MOVEMENT_TYPE_LABEL) as [
  MovementType,
  string,
][];

function MovementHistory({
  productId,
  open,
}: {
  productId: string;
  open: boolean;
}) {
  const [movements, setMovements] = React.useState<
    InventoryMovementRow[] | null
  >(null);

  React.useEffect(() => {
    if (!open) return;
    let active = true;

    async function fetchMovements() {
      if (active) setMovements(null);
      try {
        const res = await fetch(
          `/api/inventory/movements?productId=${productId}`,
          {
            cache: "no-store",
          },
        );
        const json = (await res.json()) as {
          movements: InventoryMovementRow[];
        };
        if (active) setMovements(json.movements);
      } catch {
        if (active) setMovements([]);
      }
    }

    fetchMovements();
    return () => {
      active = false;
    };
  }, [open, productId]);

  if (movements === null) {
    return (
      <p className="text-muted-foreground text-xs">A carregar histórico…</p>
    );
  }

  if (movements.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Sem movimentações registadas.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {movements.map((m) => (
        <li key={m.id} className="flex items-center justify-between text-xs">
          <div>
            <p className="font-medium">
              {MOVEMENT_TYPE_LABEL[m.reason as MovementType] ?? m.reason}
            </p>
            {m.note && <p className="text-muted-foreground">{m.note}</p>}
            <p className="text-muted-foreground">
              {formatDateTime(m.createdAt, "pt-PT")}
            </p>
          </div>
          <span
            className={
              m.quantity >= 0
                ? "text-success font-semibold"
                : "text-destructive font-semibold"
            }
          >
            {m.quantity >= 0 ? "+" : ""}
            {formatNumber(m.quantity)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AdjustStockSheet({
  product,
}: {
  product: InventoryProductRow;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<MovementType>("restock");

  const [adjustState, adjustAction, adjustPending] = useActionState<
    InventoryActionResult | null,
    FormData
  >(adjustStockAction, null);
  const [minStockState, minStockAction, minStockPending] = useActionState<
    InventoryActionResult | null,
    FormData
  >(updateMinStockAction, null);

  // Não fecha o Sheet automaticamente: o utilizador pode querer registar mais
  // de uma movimentação seguida, ou ajustar o alerta logo depois.

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <PackagePlus /> Ajustar
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Ajustar estoque</SheetTitle>
          <SheetDescription>{product.name}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
          <form action={adjustAction} className="space-y-4">
            <input type="hidden" name="productId" value={product.id} />

            {adjustState?.error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{adjustState.error}</AlertDescription>
              </Alert>
            )}
            {adjustState?.ok && adjustState.message && (
              <Alert variant="success">
                <CheckCircle2 />
                <AlertDescription>{adjustState.message}</AlertDescription>
              </Alert>
            )}

            <p className="text-muted-foreground text-xs">
              Estoque atual:{" "}
              <span className="text-foreground font-semibold">
                {formatNumber(product.stockQuantity)}
              </span>{" "}
              unidade(s)
            </p>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo de movimentação</Label>
              <select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as MovementType)}
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                {MOVEMENT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">
                Quantidade
                {type === "correction" ? " (use negativo para reduzir)" : ""}
              </Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                step="1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">
                Nota{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input id="note" name="note" maxLength={280} />
            </div>

            <Button type="submit" loading={adjustPending} className="w-full">
              Registar movimentação
            </Button>
          </form>

          <Separator />

          <form action={minStockAction} className="space-y-3">
            <input type="hidden" name="productId" value={product.id} />
            <Label htmlFor="minStockAlert">Alerta de estoque mínimo</Label>
            <div className="flex gap-2">
              <Input
                id="minStockAlert"
                name="minStockAlert"
                type="number"
                min="0"
                step="1"
                placeholder="Sem alerta"
                defaultValue={product.minStockAlert ?? ""}
              />
              <Button type="submit" variant="outline" loading={minStockPending}>
                Salvar
              </Button>
            </div>
            {minStockState?.error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{minStockState.error}</AlertDescription>
              </Alert>
            )}
            {minStockState?.ok && minStockState.message && (
              <Alert variant="success">
                <CheckCircle2 />
                <AlertDescription>{minStockState.message}</AlertDescription>
              </Alert>
            )}
            <p className="text-muted-foreground text-xs">
              Deixe em branco para desativar o alerta de estoque baixo deste
              produto.
            </p>
          </form>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Histórico de movimentações</p>
            <MovementHistory productId={product.id} open={open} />
          </div>
        </div>

        <SheetFooter className="px-0">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Fechar
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
