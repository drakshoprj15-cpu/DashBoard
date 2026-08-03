import type { Metadata } from "next";
import { Database } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getAppUrl } from "@/lib/app-url";
import { listProductOptions } from "@/features/products/queries";
import { listLandingPages } from "@/features/landing-pages/queries";
import { LandingPagesView } from "@/features/landing-pages/panel/landing-pages-view";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Landing pages" };
export const dynamic = "force-dynamic";

export default async function LandingPagesPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para criar e publicar landing pages."
        className="min-h-[420px]"
      />
    );
  }

  const [pages, products] = await Promise.all([
    listLandingPages(),
    listProductOptions(),
  ]);

  return (
    <LandingPagesView pages={pages} products={products} appUrl={getAppUrl()} />
  );
}
