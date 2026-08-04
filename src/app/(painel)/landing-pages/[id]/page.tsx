import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isDatabaseConfigured } from "@/database/client";
import { getAppUrl } from "@/lib/app-url";
import { getSession } from "@/lib/auth/session";
import { listDomains } from "@/features/domains/queries";
import { listProductOptions } from "@/features/products/queries";
import { getPublishedReviews } from "@/features/reviews/queries";
import {
  getLandingEventSeries,
  getLandingPage,
  getLandingSources,
  listLandingVersions,
} from "@/features/landing-pages/queries";
import { LandingBuilder } from "@/features/landing-pages/builder/builder";

export const metadata: Metadata = { title: "Editor de landing page" };
export const dynamic = "force-dynamic";

export default async function LandingPageEditor(
  props: PageProps<"/landing-pages/[id]">,
) {
  const { id } = await props.params;
  if (!isDatabaseConfigured()) notFound();

  const page = await getLandingPage(id);
  if (!page) notFound();

  const [products, domains, versions, series, sources, reviews, session] =
    await Promise.all([
      listProductOptions(),
      listDomains(),
      listLandingVersions(page.id),
      getLandingEventSeries(page.id),
      getLandingSources(page.id),
      page.product
        ? getPublishedReviews(page.product.slug)
        : Promise.resolve([]),
      getSession(),
    ]);

  return (
    <LandingBuilder
      page={page}
      products={products}
      domains={domains}
      versions={versions}
      series={series}
      sources={sources}
      reviews={reviews}
      appUrl={getAppUrl()}
      // Código personalizado só para quem está autenticado de verdade: em
      // modo demonstração ninguém injeta script na loja.
      canEditCode={Boolean(session && !session.demoMode)}
    />
  );
}
