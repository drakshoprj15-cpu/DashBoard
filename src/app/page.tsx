import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getDomainByHost } from "@/features/domains/queries";
import {
  LandingPageView,
  landingMetadata,
} from "@/features/landing/landing-page-view";
import { isPanelHost, normalizeHost } from "@/lib/hosts";

export const dynamic = "force-dynamic";

/** Host da requisição, normalizado (sem porta nem `www.`). */
async function requestHost(): Promise<string> {
  const h = await headers();
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
}

export async function generateMetadata(): Promise<Metadata> {
  const host = await requestHost();
  if (isPanelHost(host)) return {};

  const domain = await getDomainByHost(host);
  if (!domain?.productSlug) return {};

  return landingMetadata(domain.productSlug, `https://${domain.hostname}/`);
}

/**
 * Raiz da aplicação.
 *
 * No domínio do painel, entra no dashboard. Num domínio próprio de loja,
 * serve a landing do produto associado ao domínio (Landing pages → Domínios)
 * — é a URL usada nos anúncios, e ela nunca revela o endereço do painel.
 */
export default async function RootPage() {
  const host = await requestHost();
  if (isPanelHost(host)) redirect("/dashboard");

  const domain = await getDomainByHost(host);
  if (!domain?.productSlug) notFound();

  return <LandingPageView slug={domain.productSlug} />;
}
