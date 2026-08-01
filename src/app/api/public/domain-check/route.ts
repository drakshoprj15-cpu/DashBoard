import { NextResponse } from "next/server";

import { DOMAIN_CHECK_TOKEN } from "@/features/domains/constants";
import { normalizeHost } from "@/lib/hosts";

export const dynamic = "force-dynamic";

/**
 * Alvo da verificação de domínio (Landing pages → Domínios).
 *
 * O painel chama `https://<dominio>/api/public/domain-check`: se a resposta
 * trouxer esta assinatura, o DNS e o certificado do domínio já estão
 * apontando para esta aplicação. Pública e sem dados — só devolve o host
 * pelo qual a requisição chegou.
 */
export function GET(request: Request) {
  const host = normalizeHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );

  return NextResponse.json(
    { ok: true, app: DOMAIN_CHECK_TOKEN, host },
    { headers: { "cache-control": "no-store" } },
  );
}
