"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Globe, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { PaymentLinkDomainOption } from "@/features/payment-links/queries";

/**
 * Domínios próprios usados nos links.
 *
 * Recolhido por padrão: é configuração, não operação do dia a dia. Os dados
 * vêm da mesma tabela `domains` do resto do painel — não há um segundo
 * cadastro de domínios só para links de pagamento.
 */
export function DomainsPanel({
  domains,
}: {
  domains: PaymentLinkDomainOption[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="text-muted-foreground size-4" aria-hidden="true" />
            Domínios personalizados
            <Badge variant="muted">{domains.length}</Badge>
          </span>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {open ? (
          <div className="space-y-3 border-t px-4 py-4">
            {domains.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum domínio próprio ligado. Sem um, os links usam o domínio
                principal da aplicação.
              </p>
            ) : (
              <ul className="divide-y">
                {domains.map((domain) => (
                  <li
                    key={domain.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-medium">
                        {domain.hostname}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Adicionado em {formatDate(domain.createdAt, "pt-PT")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          !domain.isActive
                            ? "muted"
                            : domain.isVerified
                              ? "success"
                              : "warning"
                        }
                      >
                        {!domain.isActive
                          ? "Inativo"
                          : domain.isVerified
                            ? "Verificado"
                            : "Pendente"}
                      </Badge>
                      {/*
                        SSL é emitido pela plataforma de hospedagem assim que o
                        DNS resolve — por isso acompanha a verificação, em vez
                        de ser um estado inventado aqui.
                      */}
                      <Badge variant={domain.isVerified ? "info" : "muted"}>
                        {domain.isVerified ? "SSL ativo" : "SSL pendente"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Button asChild variant="outline" size="sm">
              <Link href="/landing-pages/dominios">
                <Settings className="size-3.5" />
                Gerenciar domínios
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
