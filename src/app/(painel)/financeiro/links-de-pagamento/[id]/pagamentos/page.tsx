import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import {
  buildPaymentLinkUrl,
  getPaymentLinkById,
  listPaymentLinkPayments,
  listPaymentLinks,
} from "@/features/payment-links/queries";
import { resolveLinkState, STATE_LABEL } from "@/features/payment-links/types";
import { STATUS_LABEL, STATUS_VARIANT } from "@/features/orders/status";

export const metadata: Metadata = { title: "Pagamentos do link" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

export default async function PagamentosDoLinkPage(
  props: PageProps<"/financeiro/links-de-pagamento/[id]/pagamentos">,
) {
  const { id } = await props.params;

  const record = await getPaymentLinkById(id);
  if (!record) notFound();

  const [payments, { links }] = await Promise.all([
    listPaymentLinkPayments(id),
    listPaymentLinks("all"),
  ]);

  const stats = links.find((link) => link.id === id);
  const url = buildPaymentLinkUrl(record.slug, record.domainHostname);
  const state = STATE_LABEL[
    resolveLinkState({
      isActive: record.isActive,
      archivedAt: record.archivedAt,
      expiresAt: record.expiresAt,
      maxPayments: record.maxPayments,
      paidCount: stats?.paymentsPaid ?? 0,
    })
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar">
            <Link href="/financeiro/links-de-pagamento">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">
                {record.name || record.title}
              </h2>
              <Badge
                variant={
                  state.tone === "success"
                    ? "success"
                    : state.tone === "warning"
                      ? "warning"
                      : "muted"
                }
              >
                {state.label}
              </Badge>
            </div>
            <p className="text-muted-foreground font-mono text-xs">{url}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              Abrir
            </a>
          </Button>
          <Button asChild>
            <Link href={`/financeiro/links-de-pagamento/${id}`}>Editar</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <h3 className="text-sm font-semibold">Performance</h3>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Valor"
              value={formatMoney(record.amountCents, record.currency, "pt-PT")}
            />
            <Stat
              label="Visualizações"
              value={formatNumber(stats?.views ?? 0, "pt-PT")}
            />
            <Stat
              label="Checkouts iniciados"
              value={formatNumber(stats?.paymentsStarted ?? 0, "pt-PT")}
            />
            <Stat
              label="Pendentes"
              value={formatNumber(stats?.pendingPayments ?? 0, "pt-PT")}
            />
            <Stat
              label="Aprovados"
              value={formatNumber(stats?.paymentsPaid ?? 0, "pt-PT")}
            />
            <Stat
              label="Receita"
              value={formatMoney(
                stats?.revenueCents ?? 0,
                record.currency,
                "pt-PT",
              )}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Criado em {formatDateTime(record.createdAt, "pt-PT")}
            {record.expiresAt
              ? ` · expira em ${formatDateTime(record.expiresAt, "pt-PT")}`
              : " · sem expiração"}
            {record.maxPayments
              ? ` · limite de ${record.maxPayments} pagamento(s)`
              : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <h3 className="text-sm font-semibold">Pagamentos</h3>
          {payments.length === 0 ? (
            <EmptyState
              title="Nenhum pagamento ainda"
              description="Assim que alguém pagar por este link, a cobrança aparece aqui."
              className="min-h-[200px]"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>ID no gateway</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.orderId}>
                      <TableCell className="font-medium">
                        {payment.customerName ?? "—"}
                        <span className="text-muted-foreground block font-mono text-xs">
                          {payment.reference}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {payment.customerEmail ?? "—"}
                        {payment.customerPhone ? (
                          <span className="text-muted-foreground block">
                            {payment.customerPhone}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {payment.method === "mbway"
                          ? "MB WAY"
                          : payment.method === "multibanco"
                            ? "Multibanco"
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(
                          payment.amountCents,
                          payment.currency,
                          "pt-PT",
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[payment.status] ?? "muted"}>
                          {STATUS_LABEL[payment.status] ?? payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTime(
                          payment.paidAt ?? payment.createdAt,
                          "pt-PT",
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {payment.providerTransactionId ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
