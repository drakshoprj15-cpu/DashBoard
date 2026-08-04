"use client";

import * as React from "react";
import { AlertCircle, Receipt } from "lucide-react";

import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "@/features/dashboard/period";
import type {
  LedgerDirectionFilter,
  LedgerEntryRow,
  LedgerSummary,
} from "@/features/ledger/queries";
import {
  LEDGER_TYPE_LABEL,
  LEDGER_TYPE_VARIANT,
} from "@/features/ledger/entry-type";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { NewEntrySheet } from "@/features/ledger/new-entry-sheet";

const DIRECTION_OPTIONS: { value: LedgerDirectionFilter; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "in", label: "Entradas" },
  { value: "out", label: "Saídas" },
];

interface LedgerResponse {
  entries: LedgerEntryRow[];
  summary: LedgerSummary;
}

export function LedgerView() {
  const [period, setPeriod] = React.useState<DashboardPeriod>("30d");
  const [direction, setDirection] =
    React.useState<LedgerDirectionFilter>("all");
  const [data, setData] = React.useState<LedgerResponse | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "success" | "error" | "empty"
  >("loading");

  React.useEffect(() => {
    let active = true;

    async function fetchData() {
      if (active) setStatus("loading");
      try {
        const res = await fetch(
          `/api/ledger?period=${period}&direction=${direction}`,
          {
            cache: "no-store",
          },
        );
        if (!active) return;
        if (res.status === 503) {
          setData(null);
          setStatus("empty");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as LedgerResponse;
        if (!active) return;
        setData(json);
        setStatus("success");
      } catch {
        if (active) setStatus("error");
      }
    }

    fetchData();
    return () => {
      active = false;
    };
  }, [period, direction]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Selecionar período"
            className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
          >
            {DASHBOARD_PERIODS.map((p) => (
              <Button
                key={p.value}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "h-7 px-2.5 text-xs font-medium",
                  period === p.value
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Filtrar por direção"
            className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
          >
            {DIRECTION_OPTIONS.map((d) => (
              <Button
                key={d.value}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={direction === d.value}
                onClick={() => setDirection(d.value)}
                className={cn(
                  "h-7 px-2.5 text-xs font-medium",
                  direction === d.value
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
        <NewEntrySheet />
      </div>

      {status === "loading" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[96px]" />
            ))}
          </div>
          <Skeleton className="h-[320px]" />
        </div>
      )}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            Não foi possível carregar o livro-caixa. Tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {status === "empty" && (
        <Alert>
          <AlertCircle />
          <AlertDescription>
            Configure o Supabase para acompanhar entradas e saídas.
          </AlertDescription>
        </Alert>
      )}

      {status === "success" && data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">Entradas</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-success text-xl font-bold tracking-tight">
                  {formatMoney(data.summary.inflowCents, "EUR", "pt-PT")}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">Saídas</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-destructive text-xl font-bold tracking-tight">
                  {formatMoney(data.summary.outflowCents, "EUR", "pt-PT")}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">
                  Saldo do período
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p
                  className={cn(
                    "text-xl font-bold tracking-tight",
                    data.summary.balanceCents >= 0
                      ? "text-foreground"
                      : "text-destructive",
                  )}
                >
                  {formatMoney(data.summary.balanceCents, "EUR", "pt-PT")}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent
              className={
                data.entries.length === 0 ? "" : "p-0 pt-4 sm:p-6 sm:pt-6"
              }
            >
              {data.entries.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Sem lançamentos no período"
                  description="Vendas aprovadas entram aqui automaticamente. Use “Novo lançamento” para registar entradas ou saídas manuais."
                  className="min-h-[280px]"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left text-xs">
                        <th scope="col" className="pr-3 pb-2.5 font-medium">
                          Descrição
                        </th>
                        <th scope="col" className="pr-3 pb-2.5 font-medium">
                          Tipo
                        </th>
                        <th scope="col" className="pr-3 pb-2.5 font-medium">
                          Categoria
                        </th>
                        <th
                          scope="col"
                          className="pr-3 pb-2.5 text-right font-medium"
                        >
                          Valor
                        </th>
                        <th scope="col" className="pb-2.5 font-medium">
                          Data
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="hover:bg-muted/40 border-b transition-colors last:border-0"
                        >
                          <td className="max-w-[260px] truncate py-3 pr-3 font-medium">
                            {entry.description}
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant={LEDGER_TYPE_VARIANT[entry.type]}>
                              {LEDGER_TYPE_LABEL[entry.type]}
                            </Badge>
                          </td>
                          <td className="text-muted-foreground py-3 pr-3">
                            {entry.category ?? "—"}
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-3 text-right font-semibold whitespace-nowrap",
                              entry.direction === "in"
                                ? "text-success"
                                : "text-destructive",
                            )}
                          >
                            {entry.direction === "in" ? "+" : "−"}
                            {formatMoney(
                              entry.amountCents,
                              entry.currency,
                              "pt-PT",
                            )}
                          </td>
                          <td className="text-muted-foreground py-3 text-xs whitespace-nowrap">
                            {formatDateTime(entry.occurredAt, "pt-PT")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
