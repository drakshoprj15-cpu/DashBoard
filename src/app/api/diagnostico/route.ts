import { NextResponse } from "next/server";

/**
 * Diagnóstico de configuração.
 *
 * Retorna APENAS se cada variável existe (booleano) — nunca o valor.
 * Serve para verificar, sem acesso ao painel da hospedagem, quais
 * credenciais chegaram ao ambiente de execução.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const present = (name: string) => Boolean(process.env[name]?.trim());

  return NextResponse.json({
    ambiente: process.env.VERCEL_ENV ?? "local",
    variaveis: {
      NEXT_PUBLIC_SUPABASE_URL: present("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: present("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: present("SUPABASE_SERVICE_ROLE_KEY"),
      DATABASE_URL: present("DATABASE_URL"),
      DIRECT_URL: present("DIRECT_URL"),
      BROSKI_API_KEY: present("BROSKI_API_KEY"),
      BROSKI_WEBHOOK_SECRET: present("BROSKI_WEBHOOK_SECRET"),
      UTMIFY_API_TOKEN: present("UTMIFY_API_TOKEN"),
    },
    totalDeVariaveisDoProjeto: Object.keys(process.env).filter(
      (k) =>
        k.startsWith("NEXT_PUBLIC_") ||
        k.startsWith("SUPABASE_") ||
        k.startsWith("BROSKI_") ||
        k.startsWith("DATABASE_") ||
        k.startsWith("DIRECT_") ||
        k.startsWith("UTMIFY_"),
    ).length,
  });
}
