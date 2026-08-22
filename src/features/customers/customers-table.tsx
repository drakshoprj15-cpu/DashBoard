"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Package2,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CustomerListRow,
  CustomerStatusTag,
} from "@/features/customers/types";
import { activityLabel } from "@/features/customers/customer-utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CustomersTableProps {
  rows: CustomerListRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
}

const statusClasses: Record<CustomerStatusTag["key"], string> = {
  buyer:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  imported_paid:
    "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300",
  imported_pending:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  lead: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  abandoned:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  recurring:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  pending:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  refused:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function relativeTime(value: string): string {
  const delta = new Date(value).getTime() - Date.now();
  const abs = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (abs < 60 * 60 * 1000)
    return formatter.format(Math.round(delta / 60000), "minute");
  if (abs < 24 * 60 * 60 * 1000)
    return formatter.format(Math.round(delta / 3600000), "hour");
  return formatter.format(Math.round(delta / 86400000), "day");
}

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} copiado.`);
}

function whatsappUrl(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

function StatusBadges({ statuses }: { statuses: CustomerStatusTag[] }) {
  return (
    <div className="flex max-w-[230px] flex-wrap gap-1">
      {statuses.slice(0, 2).map((status) => (
        <Badge
          key={status.key}
          variant="outline"
          className={cn("text-[10px]", statusClasses[status.key])}
        >
          {status.label}
        </Badge>
      ))}
      {statuses.length > 2 && (
        <Badge variant="muted" className="text-[10px]">
          +{statuses.length - 2}
        </Badge>
      )}
    </div>
  );
}

function ProductCell({ row }: { row: CustomerListRow }) {
  if (row.productNames.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">
        Produto não informado
      </span>
    );
  }
  const label = row.productNames.join(" · ");
  return (
    <div className="flex max-w-[230px] items-start gap-2">
      <span className="bg-primary/8 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
        <Package2 className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium" title={label}>
          {label}
        </p>
        <p className="text-muted-foreground text-[10px]">
          {row.productSource === "order"
            ? "Confirmado pelo pedido"
            : "Informado na importação"}
        </p>
      </div>
    </div>
  );
}

function RowActions({
  row,
  onOpen,
}: {
  row: CustomerListRow;
  onOpen: () => void;
}) {
  const whatsapp = whatsappUrl(row.phone);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Ações para ${row.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onOpen}>Ver cliente</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/pedidos?customerId=${row.id}`}>
            <ShoppingBag /> Ver pedidos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/emails?recipients=${row.id}`}>
            <Mail /> Enviar e-mail
          </Link>
        </DropdownMenuItem>
        {whatsapp && (
          <DropdownMenuItem asChild>
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle /> Abrir WhatsApp
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void copyText(row.id, "Identificador")}
        >
          <Copy /> Copiar ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CustomersTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
}: CustomersTableProps) {
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));

  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-4">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Selecionar todos os clientes desta página"
                  className="accent-primary size-4 rounded"
                />
              </TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Total gasto</TableHead>
              <TableHead>Última atividade</TableHead>
              <TableHead className="w-10 pr-4 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={selected.has(row.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => onOpen(row.id)}
              >
                <TableCell
                  className="pl-4"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => onToggle(row.id)}
                    aria-label={`Selecionar ${row.name}`}
                    className="accent-primary size-4 rounded"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {initials(row.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="max-w-[210px] truncate font-medium">
                        {row.name}
                      </p>
                      <p className="text-muted-foreground max-w-[210px] truncate text-[11px]">
                        {row.city && row.state
                          ? `${row.city}, ${row.state}`
                          : `#${row.id.slice(0, 8)}`}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[210px] truncate text-xs">
                      {row.email}
                    </span>
                    {row.emailStatus === "valid" && (
                      <Check
                        className="size-3.5 text-success"
                        aria-label="E-mail válido"
                      />
                    )}
                    <button
                      type="button"
                      aria-label="Copiar e-mail"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyText(row.email, "E-mail");
                      }}
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  {row.phone ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span>{row.phone}</span>
                      <button
                        type="button"
                        aria-label="Copiar telefone"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyText(row.phone ?? "", "Telefone");
                        }}
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Não informado
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadges statuses={row.statuses} />
                </TableCell>
                <TableCell>
                  <ProductCell row={row} />
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-medium">
                    {formatNumber(row.orderCount)}
                  </span>
                  {row.paidCount > 0 && (
                    <span className="text-success block text-[11px]">
                      {row.paidCount} pagos
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatMoney(row.totalSpentCents, row.currency)}
                </TableCell>
                <TableCell>
                  <p className="text-xs">
                    {activityLabel(row.lastActivityType)}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {relativeTime(row.lastActivityAt)}
                  </p>
                </TableCell>
                <TableCell
                  className="pr-4 text-right"
                  onClick={(event) => event.stopPropagation()}
                >
                  <RowActions row={row} onOpen={() => onOpen(row.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y lg:hidden">
        {rows.map((row) => (
          <article
            key={row.id}
            className="hover:bg-muted/30 cursor-pointer space-y-3 p-4"
            onClick={() => onOpen(row.id)}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => onToggle(row.id)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Selecionar ${row.name}`}
                className="accent-primary mt-1 size-4 rounded"
              />
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials(row.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {row.email}
                </p>
                <p className="text-muted-foreground text-xs">
                  {row.phone ?? "Telefone não informado"}
                </p>
              </div>
              <div onClick={(event) => event.stopPropagation()}>
                <RowActions row={row} onOpen={() => onOpen(row.id)} />
              </div>
            </div>
            <StatusBadges statuses={row.statuses} />
            <ProductCell row={row} />
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Pedidos</dt>
                <dd className="font-semibold">{row.orderCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total gasto</dt>
                <dd className="font-semibold">
                  {formatMoney(row.totalSpentCents, row.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Atividade</dt>
                <dd className="font-semibold">
                  {relativeTime(row.lastActivityAt)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
