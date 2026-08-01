import type { Metadata } from "next";
import { Database, Globe } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listDomains } from "@/features/domains/queries";
import { listProductOptions } from "@/features/products/queries";
import { DNS_RECORDS } from "@/features/domains/constants";
import { DomainForm } from "@/features/domains/domain-form";
import { DomainCard } from "@/features/domains/domain-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Domínios" };
export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para gerir os domínios."
        className="min-h-[420px]"
      />
    );
  }

  const [domains, products] = await Promise.all([
    listDomains(),
    listProductOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Domínios</h2>
        <p className="text-muted-foreground text-sm">
          Um domínio próprio por produto · o cliente nunca vê o endereço do
          painel, e um bloqueio na loja não derruba o painel junto
        </p>
      </div>

      <DomainForm products={products} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Como apontar um domínio novo
          </CardTitle>
          <CardDescription>
            Vale para qualquer domínio, comprado em qualquer registrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5">
            <li>Compre o domínio (Hostinger, Registro.br, onde preferir).</li>
            <li>
              Na Vercel, abra o projeto{" "}
              <code className="bg-muted rounded px-1 font-mono text-xs">
                dash-board
              </code>{" "}
              → Settings → Domains → Add, e cadastre o domínio.
            </li>
            <li>No registrador, crie estes dois registros de DNS:</li>
          </ol>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground border-b text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Tipo</th>
                  <th className="py-2 pr-4 font-medium">Nome</th>
                  <th className="py-2 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {DNS_RECORDS.map((record) => (
                  <tr key={record.type} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">
                      {record.type}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {record.name}
                    </td>
                    <td className="py-2 font-mono text-xs break-all">
                      {record.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-muted-foreground">
            Depois cadastre o domínio acima, escolha o produto e clique em
            Verificar. A propagação do DNS e a emissão do certificado costumam
            levar de alguns minutos a uma hora.
          </p>
        </CardContent>
      </Card>

      {domains.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="Nenhum domínio cadastrado"
          description="Enquanto não houver domínio próprio, as landing pages continuam a ser servidas no endereço do painel."
          className="min-h-[200px]"
        />
      ) : (
        <div className="space-y-3">
          {domains.map((domain) => (
            <DomainCard key={domain.id} domain={domain} />
          ))}
        </div>
      )}
    </div>
  );
}
