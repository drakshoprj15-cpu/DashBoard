"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Abas Geral/Meta controladas pela URL (`?tab=`) — necessário porque o log
 * de eventos filtra via formulário GET (recarrega a página com novos
 * parâmetros) e precisa continuar mostrando a aba Meta depois de filtrar.
 */
export function PixelTabs({
  general,
  meta,
}: {
  general: ReactNode;
  meta: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") === "meta" ? "meta" : "geral";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "meta") params.set("tab", "meta");
    else params.delete("tab");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={activeTab} onValueChange={handleChange}>
      <TabsList>
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="meta">Meta</TabsTrigger>
      </TabsList>
      <TabsContent value="geral" className="space-y-6 pt-4">
        {general}
      </TabsContent>
      <TabsContent value="meta" className="space-y-6 pt-4">
        {meta}
      </TabsContent>
    </Tabs>
  );
}
