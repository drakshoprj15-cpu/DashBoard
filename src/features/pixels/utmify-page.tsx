import { Link2, RefreshCw, ShieldCheck } from "lucide-react";

import type { getUtmifyPageData } from "@/features/pixels/utmify-queries";
import {
  requeueUtmifyDeliveryAction,
  toggleUtmifyIntegrationAction,
} from "@/features/pixels/utmify-actions";
import { UtmifyForm } from "@/features/pixels/utmify-form";
import { UtmifyDeleteButton } from "@/features/pixels/utmify-delete-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Data = Awaited<ReturnType<typeof getUtmifyPageData>>;

function when(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value as string | number | Date));
}

const SALE_LABEL: Record<string, string> = {
  waiting_payment: "Aguardando pagamento",
  paid: "Aprovada",
  refused: "Recusada",
  refunded: "Reembolsada",
  chargedback: "Contestada",
};

export function UtmifyPage({ data }: { data: Data }) {
  const stats = [
    ["Integrações ativas", data.stats.active],
    ["Vendas geradas · 24h", data.stats.generated24h],
    ["Vendas aprovadas · 24h", data.stats.approved24h],
    ["Envios pendentes", data.stats.pending],
    ["Envios com erro", data.stats.errors],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">UTMify — rastreamento e atribuição de vendas</h2>
        <p className="text-muted-foreground mt-1 text-sm">Conecte sua operação à UTMify para enviar vendas geradas, aprovadas, recusadas, reembolsadas e contestadas com seus respectivos parâmetros de campanha.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-card px-3 py-2"><p className="text-muted-foreground text-xs">{label}</p><p className="text-lg font-bold tabular-nums">{value}</p></div>)}
      </div>
      <Alert variant="info">
        <Link2 />
        <AlertTitle>Onde encontrar a credencial</AlertTitle>
        <AlertDescription>Na UTMify, acesse Integrações → Webhooks → Credenciais de API → Adicionar credencial. Copie o token criado e cole neste campo.</AlertDescription>
      </Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Configuração server-side</CardTitle><CardDescription>O token é criptografado e isolado por workspace. Nenhuma chamada parte do navegador.</CardDescription></CardHeader>
        <CardContent><UtmifyForm integration={data.integration} /></CardContent>
      </Card>
      <div>
        <h3 className="mb-3 text-sm font-semibold">Integrações cadastradas</h3>
        {!data.integration ? (
          <EmptyState icon={Link2} title="Nenhuma integração UTMify cadastrada" description="Conecte sua credencial para começar a enviar e atribuir suas vendas." className="min-h-[220px]" />
        ) : (
          <Card><CardContent className="space-y-4 pt-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div><p className="font-semibold">{data.integration.name}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant={data.integration.isActive ? "success" : "muted"}>{data.integration.isActive ? "Ativa" : "Inativa"}</Badge><Badge variant={data.integration.connectionStatus === "valid" ? "success" : "warning"}>{data.integration.connectionStatus === "valid" ? "Conexão válida" : "Teste necessário"}</Badge><code className="bg-muted rounded px-2 py-0.5 text-xs">{data.integration.tokenPreview}</code></div></div>
              <div className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2 sm:gap-x-6"><span>Último teste: {when(data.integration.lastConnectionTestAt)}</span><span>Última sincronização: {when(data.integration.lastSyncAt)}</span><span>Total enviado: {data.integration.totalSent}</span><span>Plataforma: {data.integration.platform}</span></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={toggleUtmifyIntegrationAction}><input type="hidden" name="active" value={String(!data.integration.isActive)} /><Button size="sm" variant="outline">{data.integration.isActive ? "Desativar" : "Ativar"}</Button></form>
              <Button size="sm" variant="outline" asChild><a href="#utmify-name">Editar credencial</a></Button>
              <UtmifyDeleteButton />
            </div>
          </CardContent></Card>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Entregas</CardTitle><CardDescription>Histórico sanitizado dos pedidos enviados pelo servidor.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input type="hidden" name="tab" value="utmify" />
            <Input name="order" placeholder="Pedido" />
            <select name="saleStatus" className="border-input bg-card h-9 rounded-md border px-3 text-sm"><option value="">Status da venda</option>{Object.entries(SALE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select name="result" className="border-input bg-card h-9 rounded-md border px-3 text-sm"><option value="">Sucesso/erro</option><option value="success">Sucesso</option><option value="pending">Pendente</option><option value="failed">Erro</option><option value="dead_letter">Esgotado</option></select>
            <Input name="minAttempts" type="number" min="1" placeholder="Tentativas mín." />
            <Input name="from" type="date" aria-label="Data inicial" />
            <Button variant="outline" type="submit">Filtrar</Button>
          </form>
          <div className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Venda</TableHead><TableHead>Entrega</TableHead><TableHead>Tentativas</TableHead><TableHead>HTTP</TableHead><TableHead>Horário</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
              <TableBody>{data.deliveries.length ? data.deliveries.map((delivery) => <TableRow key={String(delivery.id)}><TableCell className="font-medium">{String(delivery.orderReference)}</TableCell><TableCell>{SALE_LABEL[String(delivery.saleStatus)] ?? String(delivery.saleStatus)}</TableCell><TableCell><Badge variant={delivery.status === "success" ? "success" : delivery.status === "pending" || delivery.status === "processing" ? "warning" : "destructive"}>{String(delivery.status)}</Badge>{delivery.errorMessage ? <p className="text-muted-foreground mt-1 max-w-64 text-xs">{String(delivery.errorMessage)}</p> : null}</TableCell><TableCell>{String(delivery.attemptCount)}</TableCell><TableCell>{delivery.httpStatus ? String(delivery.httpStatus) : "—"}</TableCell><TableCell>{when(delivery.createdAt)}</TableCell><TableCell className="text-right">{delivery.status === "failed" || delivery.status === "dead_letter" ? <form action={requeueUtmifyDeliveryAction}><input type="hidden" name="id" value={String(delivery.id)} /><Button size="sm" variant="outline"><RefreshCw /> Reenviar</Button></form> : "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Nenhuma entrega encontrada.</TableCell></TableRow>}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Alert><ShieldCheck /><AlertDescription>Os logs guardam apenas pedido, integração, status, tentativa, duração, código HTTP e mensagem sanitizada. Token e dados pessoais não são gravados.</AlertDescription></Alert>
    </div>
  );
}
