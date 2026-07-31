import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { and, eq, isNull } from "drizzle-orm";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDb, isDatabaseConfigured } from "@/database/client";
import { pixels } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getWorkspaceBranding } from "@/features/branding/queries";
import { BrandingForm } from "@/features/branding/branding-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Configurações" };

interface ServiceStatus {
  name: string;
  description: string;
  configured: boolean;
  envVars: string[];
}

/**
 * A UTMify não usa variável de ambiente — o token fica cifrado por
 * workspace na tabela `pixels` (mesmo padrão da Meta CAPI), configurado em
 * /pixel. Checar aqui a fonte real evita mostrar "Desconectado" com a
 * credencial já cadastrada e ativa.
 */
async function isUtmifyConfigured(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .select({ id: pixels.id })
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        eq(pixels.type, "utmify"),
        eq(pixels.isActive, true),
        isNull(pixels.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export default async function ConfiguracoesPage() {
  // Verificação honesta: apenas checa a presença das variáveis de ambiente.
  // "Configurado" ainda não significa "conexão validada" — o teste real de
  // conexão de cada serviço será implementado na fase correspondente.
  const utmifyConfigured = await isUtmifyConfigured();
  const branding = await getWorkspaceBranding();

  const services: ServiceStatus[] = [
    {
      name: "Supabase (banco, auth, realtime)",
      description: "Necessário para login real, dados e RLS",
      configured: isSupabaseConfigured(),
      envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    },
    {
      name: "Resend (e-mails)",
      description: "Envio de e-mails transacionais e campanhas",
      configured: Boolean(process.env.RESEND_API_KEY),
      envVars: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
    },
    {
      name: "Broski (gateway principal)",
      description: "MB WAY e Multibanco — Portugal (EUR). Adapter pronto.",
      configured: Boolean(process.env.BROSKI_API_KEY),
      envVars: ["BROSKI_API_KEY", "BROSKI_WEBHOOK_SECRET"],
    },
    {
      name: "Stripe",
      description: "Gateway de pagamento",
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
      envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
    {
      name: "Mercado Pago",
      description: "Gateway de pagamento",
      configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      envVars: ["MERCADO_PAGO_ACCESS_TOKEN"],
    },
    {
      name: "Pagar.me",
      description: "Gateway de pagamento",
      configured: Boolean(process.env.PAGARME_API_KEY),
      envVars: ["PAGARME_API_KEY"],
    },
    {
      name: "Asaas",
      description: "Gateway de pagamento",
      configured: Boolean(process.env.ASAAS_API_KEY),
      envVars: ["ASAAS_API_KEY"],
    },
    {
      name: "UTMify",
      description:
        "Rastreamento de conversões — token cadastrado em /pixel, não por variável de ambiente.",
      configured: utmifyConfigured,
      envVars: [],
    },
    {
      name: "Upstash Redis",
      description: "Rate limiting, cache e filas",
      configured: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground text-sm">
          Status das credenciais de serviços externos. As páginas completas de
          configuração de cada integração serão construídas nas fases 4 e 7.
        </p>
      </div>

      <BrandingForm initial={branding} />

      <div className="grid gap-3 md:grid-cols-2">
        {services.map((service) => (
          <Card key={service.name} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                {service.configured ? (
                  <CheckCircle2 className="text-success size-4" />
                ) : (
                  <XCircle className="text-muted-foreground size-4" />
                )}
                {service.name}
              </CardTitle>
              <CardDescription className="text-xs">
                {service.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={service.configured ? "success" : "muted"}>
                  {service.configured
                    ? "Credenciais presentes"
                    : "Desconectado"}
                </Badge>
                {service.envVars.map((v) => (
                  <code
                    key={v}
                    className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {v}
                  </code>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
