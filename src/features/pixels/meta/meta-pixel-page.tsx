"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import type { PixelRow } from "@/features/pixels/types";
import {
  LandingPageSelector,
  type LandingPagePickerItem,
} from "./landing-page-selector";
import { PixelIntegrationList } from "./pixel-integration-list";
import { PurchaseCountingCard } from "./purchase-counting-card";

interface LandingPageMetaResponse {
  pixels: PixelRow[];
  purchaseRule: { rule: "generated" | "approved"; hasOverride: boolean };
}

interface MetaPixelPageProps {
  landingPages: LandingPagePickerItem[];
  initialWorkspaceRuleOn: boolean;
}

export function MetaPixelPage({
  landingPages,
  initialWorkspaceRuleOn,
}: MetaPixelPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("lp");

  // Guarda a resposta junto com o id a que ela pertence — evita um segundo
  // `setState` síncrono só para controlar "carregando" (o "loading" é
  // derivado comparando `result.id` com a seleção atual).
  const [result, setResult] = useState<{
    id: string;
    data: LandingPageMetaResponse;
  } | null>(null);
  const loading = Boolean(selectedId) && result?.id !== selectedId;
  const data = result?.id === selectedId ? result.data : null;

  const select = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "meta");
      params.set("lp", id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!selectedId) return;

    const controller = new AbortController();
    const id = selectedId;

    fetch(`/api/pixel/meta/landing-page/${id}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar esta landing page.");
        return (await res.json()) as LandingPageMetaResponse;
      })
      .then((body) => {
        if (!controller.signal.aborted) setResult({ id, data: body });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.error(
          error instanceof Error ? error.message : "Erro ao carregar landing page.",
        );
      });

    return () => controller.abort();
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            Pixels Meta por Landing Page
          </h3>
          <p className="text-muted-foreground text-xs">
            Configure pixels exclusivos para uma landing page. Quando houver
            pixels próprios, eles serão usados no lugar dos pixels globais da
            loja.
          </p>
          <LandingPageSelector
            items={landingPages}
            selectedId={selectedId}
            onSelect={select}
          />
        </div>

        <div className="space-y-6">
          {!selectedId ? (
            <PurchaseCountingCard
              landingPageId={null}
              initialValue={initialWorkspaceRuleOn}
            />
          ) : loading || !data ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <PurchaseCountingCard
                key={selectedId}
                landingPageId={selectedId}
                initialValue={data.purchaseRule.rule === "generated"}
                initialHasOverride={data.purchaseRule.hasOverride}
              />
              <PixelIntegrationList
                key={selectedId}
                landingPageId={selectedId}
                initialPixels={data.pixels}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
