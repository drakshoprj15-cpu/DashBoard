"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Mail,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/lib/format";
import { maskDocument } from "@/lib/mask";
import {
  PAYMENT_METHOD_LABEL,
  isRecoverableCategory,
} from "@/features/carts/status";
import { whatsAppUrl } from "@/features/carts/phone";
import type { CartRowDTO } from "@/features/carts/client-types";
import { CartStatusBadge } from "@/features/carts/cart-status-badge";
import { CartRecoveryActions } from "@/features/carts/cart-recovery-actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  } catch {
    toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "há poucos minutos";
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Resumo curto do último lembrete, ou um traço quando ainda não houve nenhum. */
function lastReminderLabel(row: CartRowDTO): string {
  if (!row.lastReminderSentAt) return "—";
  const channel =
    row.lastReminderChannel === "whatsapp" ? "WhatsApp" : "E-mail";
  const times = row.reminderCount > 1 ? ` · ${row.reminderCount}×` : "";
  return `${channel} ${relativeTime(row.lastReminderSentAt)}${times}`;
}

export interface CartsTableProps {
  rows: CartRowDTO[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selected: Set<string>;
  onToggleSelect: (orderId: string) => void;
  onToggleSelectAll: () => void;
  onOpenDetail: (orderId: string) => void;
  sortBy: CartSortBy;
  sortDir: "asc" | "desc";
  onSort: (sortBy: CartSortBy) => void;
  onSendReminder: (row: CartRowDTO) => void;
  onOpenWhatsApp: (row: CartRowDTO) => void;
  onMarkStatus: (
    orderId: string,
    mark: "recovered" | "refused" | "pending",
  ) => void;
  onArchive: (orderId: string, archived: boolean) => void;
  onSync: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onExportOne: (orderId: string) => void;
  syncingIds: Set<string>;
  hasFilters: boolean;
}

type CartSortBy = "createdAt" | "totalCents" | "lastReminderSentAt";

const CANCELLABLE = new Set(["awaiting_payment", "pending", "abandoned"]);

export function CartsTable({
  rows,
  loading,
  error,
  onRetry,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onOpenDetail,
  sortBy,
  sortDir,
  onSort,
  onSendReminder,
  onOpenWhatsApp,
  onMarkStatus,
  onArchive,
  onSync,
  onCancel,
  onExportOne,
  syncingIds,
  hasFilters,
}: CartsTableProps) {
  const [revealedDocs, setRevealedDocs] = React.useState<Set<string>>(
    new Set(),
  );

  const toggleReveal = (orderId: string) => {
    setRevealedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTriangle />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          Não foi possível carregar os carrinhos.
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title={
          hasFilters
            ? "Nenhum resultado para estes filtros"
            : "Nenhum carrinho ainda"
        }
        description={
          hasFilters
            ? "Ajuste ou limpe os filtros para ver outros carrinhos."
            : "Assim que um cliente iniciar um checkout, ele aparece aqui."
        }
        className="min-h-[280px] border-0"
      />
    );
  }

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.orderId));

  return (
    <>
      {/* Telas pequenas: a tabela vira lista de cartões — uma tabela de 13
          colunas em 375px só produz rolagem horizontal inútil. */}
      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={r.orderId} className="space-y-2 p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(r.orderId)}
                onChange={() => onToggleSelect(r.orderId)}
                className="accent-primary mt-1 size-4"
                aria-label={`Selecionar carrinho ${r.reference}`}
              />
              <button
                type="button"
                onClick={() => onOpenDetail(r.orderId)}
                className="flex-1 text-left"
              >
                <p className="font-medium">{r.customerName ?? "—"}</p>
                <p className="text-muted-foreground text-xs">
                  {r.customerEmail ?? r.customerPhone ?? ""}
                </p>
              </button>
              <div className="text-right">
                <p className="font-semibold">
                  {formatMoney(r.totalCents, r.currency, "pt-PT")}
                </p>
                <CartStatusBadge category={r.category} />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {r.productName ?? "—"}
              {r.quantity && r.quantity > 1 ? ` ×${r.quantity}` : ""} ·{" "}
              {relativeTime(r.createdAt)}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {lastReminderLabel(r)}
              </span>
              <CartRecoveryActions
                row={r}
                onSendEmail={onSendReminder}
                onOpenWhatsApp={onOpenWhatsApp}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="accent-primary size-4"
                  aria-label="Selecionar todos os carrinhos desta página"
                />
              </TableHead>
              <TableHead>Referência</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-center">Artigos</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead
                className="cursor-pointer text-right select-none"
                onClick={() => onSort("totalCents")}
              >
                Valor{" "}
                {sortBy === "totalCents" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => onSort("createdAt")}
              >
                Atualizado em{" "}
                {sortBy === "createdAt" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => onSort("lastReminderSentAt")}
              >
                Último lembrete{" "}
                {sortBy === "lastReminderSentAt" &&
                  (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Recuperação manual</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const wa = r.customerPhone ? whatsAppUrl(r.customerPhone) : null;
              const revealed = revealedDocs.has(r.orderId);
              const isSyncing = syncingIds.has(r.orderId);

              return (
                <TableRow
                  key={r.orderId}
                  data-state={selected.has(r.orderId) ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => onOpenDetail(r.orderId)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.orderId)}
                      onChange={() => onToggleSelect(r.orderId)}
                      className="accent-primary size-4"
                      aria-label={`Selecionar carrinho ${r.reference}`}
                    />
                  </TableCell>

                  <TableCell className="font-mono text-xs">
                    {r.reference}
                  </TableCell>

                  <TableCell>
                    <p className="font-medium">{r.customerName ?? "—"}</p>
                    <p className="text-muted-foreground text-xs">
                      {r.customerEmail ?? ""}
                    </p>
                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {r.customerPhone ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{r.customerPhone}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(r.customerPhone!, "Telefone")
                              }
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Copiar telefone"
                            >
                              <Copy className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar telefone</TooltipContent>
                        </Tooltip>
                        {wa && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-success"
                                aria-label="Abrir conversa no WhatsApp"
                              >
                                <MessageCircle className="size-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Abrir no WhatsApp</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {r.customerDocument ? (
                      <div className="flex items-center gap-1 font-mono text-xs">
                        {revealed
                          ? r.customerDocument
                          : maskDocument(r.customerDocument)}
                        <button
                          type="button"
                          onClick={() => toggleReveal(r.orderId)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={
                            revealed ? "Ocultar documento" : "Revelar documento"
                          }
                        >
                          {revealed ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(r.customerDocument!, "Documento")
                          }
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Copiar documento"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {r.productName ?? "—"}
                    {r.itemCount > 1 && (
                      <span className="text-muted-foreground block text-xs">
                        +{r.itemCount - 1} outro{r.itemCount > 2 ? "s" : ""}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-center text-xs">
                    {r.quantity ?? 1}
                  </TableCell>

                  <TableCell className="text-xs">
                    {r.paymentMethod ? (
                      <>
                        {PAYMENT_METHOD_LABEL[r.paymentMethod] ??
                          r.paymentMethod}
                        {r.cardBrand && r.cardLast4 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {r.cardBrand} •••• {r.cardLast4}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right font-medium">
                    {formatMoney(r.totalCents, r.currency, "pt-PT")}
                  </TableCell>

                  <TableCell>
                    <CartStatusBadge category={r.category} />
                  </TableCell>

                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xs">
                          <span>{relativeTime(r.updatedAt)}</span>
                          <span className="text-muted-foreground block">
                            {formatDateTime(r.updatedAt, "pt-PT")}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Fuso horário local do navegador
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  <TableCell className="text-xs">
                    {r.lastReminderSentAt ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{lastReminderLabel(r)}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDateTime(r.lastReminderSentAt, "pt-PT")}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <CartRecoveryActions
                      row={r}
                      onSendEmail={onSendReminder}
                      onOpenWhatsApp={onOpenWhatsApp}
                    />
                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Mais ações"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onOpenDetail(r.orderId)}
                        >
                          Ver detalhes
                        </DropdownMenuItem>
                        {r.customerEmail && (
                          <DropdownMenuItem
                            onClick={() =>
                              copyToClipboard(r.customerEmail!, "E-mail")
                            }
                          >
                            Copiar e-mail
                          </DropdownMenuItem>
                        )}
                        {r.customerPhone && (
                          <DropdownMenuItem
                            onClick={() =>
                              copyToClipboard(r.customerPhone!, "Telefone")
                            }
                          >
                            Copiar telefone
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            copyToClipboard(r.reference, "Referência")
                          }
                        >
                          Copiar referência
                        </DropdownMenuItem>
                        {r.checkoutUrl && (
                          <DropdownMenuItem
                            onClick={() =>
                              copyToClipboard(
                                r.checkoutUrl!,
                                "Link do checkout",
                              )
                            }
                          >
                            Copiar link do checkout
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {isRecoverableCategory(r.category) && (
                          <DropdownMenuItem onClick={() => onSendReminder(r)}>
                            <Mail /> Enviar lembrete de pagamento
                          </DropdownMenuItem>
                        )}
                        {whatsAppUrl(r.customerPhone) && (
                          <DropdownMenuItem onClick={() => onOpenWhatsApp(r)}>
                            <MessageCircle /> Recuperar por WhatsApp
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {r.category !== "paid" &&
                          r.category !== "recovered" && (
                            <DropdownMenuItem
                              onClick={() =>
                                onMarkStatus(r.orderId, "recovered")
                              }
                            >
                              <CheckCircle2 /> Marcar como convertido
                            </DropdownMenuItem>
                          )}
                        {isRecoverableCategory(r.category) &&
                          r.category !== "declined" && (
                            <DropdownMenuItem
                              onClick={() => onMarkStatus(r.orderId, "refused")}
                            >
                              Marcar como recusado
                            </DropdownMenuItem>
                          )}
                        {r.category === "awaiting_payment" ||
                        r.category === "abandoned" ? (
                          <DropdownMenuItem
                            onClick={() => onMarkStatus(r.orderId, "pending")}
                          >
                            Marcar como pendente
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {r.externalId && (
                          <DropdownMenuItem
                            disabled={isSyncing}
                            onClick={() => onSync(r.orderId)}
                          >
                            <RefreshCw
                              className={cn(isSyncing && "animate-spin")}
                            />{" "}
                            Sincronizar status
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => onExportOne(r.orderId)}
                        >
                          Exportar dados
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onArchive(r.orderId, !r.archivedAt)}
                        >
                          <Archive />{" "}
                          {r.archivedAt ? "Desarquivar" : "Arquivar"} carrinho
                        </DropdownMenuItem>
                        {CANCELLABLE.has(r.category) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => onCancel(r.orderId)}
                            >
                              <XCircle /> Cancelar pedido
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
