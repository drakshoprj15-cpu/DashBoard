import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Checkouts" };

export default function CheckoutsPage() {
  return (
    <ModulePlaceholder
      title="Checkouts"
      description="Criação, edição e publicação de checkouts com editor visual (preview desktop/tablet/celular), order bump, cupons, frete e URL pública /checkout/[slug]."
      phase={3}
    />
  );
}
