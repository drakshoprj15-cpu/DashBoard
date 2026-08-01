import type { Metadata } from "next";
import { Suspense } from "react";
import { Database } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listProductOptions } from "@/features/products/queries";
import { CarrinhosView } from "@/features/carts/carrinhos-view";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Carrinhos" };
export const dynamic = "force-dynamic";

export default async function CarrinhosPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para acompanhar os carrinhos e pagamentos."
        className="min-h-[420px]"
      />
    );
  }

  const products = await listProductOptions();

  return (
    <Suspense fallback={<Skeleton className="h-[600px]" />}>
      <CarrinhosView products={products} />
    </Suspense>
  );
}
