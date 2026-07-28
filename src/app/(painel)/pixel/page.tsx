import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Pixel" };

export default function PixelPage() {
  return (
    <ModulePlaceholder
      title="Pixel"
      description="Meta Pixel, Conversions API, GTM, Google Analytics, TikTok Pixel e UTMify — com deduplicação por event_id, Purchase apenas após confirmação, teste de eventos e script de instalação externa."
      phase={7}
    />
  );
}
