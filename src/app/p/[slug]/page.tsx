import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";

import {
  getDomainByHost,
  getVerifiedDomainForProductSlug,
} from "@/features/domains/queries";
import {
  LandingPageView,
  landingMetadata,
} from "@/features/landing/landing-page-view";
import { isPanelHost, normalizeHost } from "@/lib/hosts";

/** Host da requisição, normalizado (sem porta nem `www.`). */
async function requestHost(): Promise<string> {
  const h = await headers();
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
}

export async function generateMetadata(
  props: PageProps<"/p/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const hostname = await getVerifiedDomainForProductSlug(slug);
  return landingMetadata(slug, hostname ? `https://${hostname}/` : undefined);
}

/**
 * Landing page pública (rota /p/[slug]).
 *
 * Quando o produto já tem domínio próprio verificado e o acesso chega pelo
 * domínio do painel, redireciona permanentemente para o domínio da loja —
 * links antigos de anúncios continuam funcionando sem expor o painel.
 */
export default async function ProductLandingPage(
  props: PageProps<"/p/[slug]">,
) {
  const { slug } = await props.params;
  const host = await requestHost();

  if (isPanelHost(host)) {
    const hostname = await getVerifiedDomainForProductSlug(slug);
    if (hostname) permanentRedirect(`https://${hostname}/`);
  } else {
    // No domínio da loja, /p/[slug] só serve o produto daquele domínio.
    const domain = await getDomainByHost(host);
    if (domain?.productSlug && domain.productSlug !== slug) notFound();
  }

  return <LandingPageView slug={slug} />;
}
