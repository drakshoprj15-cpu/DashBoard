import type { Metadata } from "next";
import { Suspense } from "react";
import { Database } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomersView } from "@/features/customers/customers-view";
import { listProductOptions } from "@/features/products/queries";
import { isDatabaseConfigured } from "@/database/client";

export const metadata: Metadata = {
  title: "Clientes | Infinity",
  description: "Central de clientes, pedidos, carrinhos e relacionamento.",
};

export const dynamic = "force-dynamic";

function CustomersLoading() {
  return (
    <div className="space-y-5" aria-label="Carregando clientes">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[560px] rounded-xl" />
    </div>
  );
}

export default async function CustomersPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não configurado"
        description="Configure a conexão com o banco para visualizar e gerenciar os clientes."
      />
    );
  }

  const products = await listProductOptions();

  return (
    <Suspense fallback={<CustomersLoading />}>
      <CustomersView products={products} />
    </Suspense>
  );
}
