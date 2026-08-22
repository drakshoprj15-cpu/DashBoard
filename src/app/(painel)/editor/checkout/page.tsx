import type { Metadata } from "next";

import { getWorkspaceBranding } from "@/features/branding/queries";
import { BrandingForm } from "@/features/branding/branding-form";

export const metadata: Metadata = { title: "Editor · Checkout" };
export const dynamic = "force-dynamic";

export default async function EditorCheckoutPage() {
  const branding = await getWorkspaceBranding();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          Identidade do checkout
        </h2>
        <p className="text-muted-foreground text-sm">
          Troque a logo exibida no pagamento e confira o tamanho antes de
          salvar. A alteração vale também no celular.
        </p>
      </div>

      <BrandingForm initial={branding} />
    </div>
  );
}
