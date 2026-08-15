import type { Metadata } from "next";

import { getAppUrl } from "@/lib/app-url";
import {
  listCatalogProductsForLinks,
  listPaymentLinkDomains,
  listPaymentLinkPixels,
} from "@/features/payment-links/queries";
import { LinkForm } from "@/features/payment-links/link-form";

export const metadata: Metadata = { title: "Novo link de pagamento" };

export default async function NovoLinkPage() {
  const [domains, products, pixels] = await Promise.all([
    listPaymentLinkDomains(),
    listCatalogProductsForLinks(),
    listPaymentLinkPixels(),
  ]);

  return (
    <LinkForm
      domains={domains}
      products={products}
      pixels={pixels}
      appOrigin={getAppUrl()}
    />
  );
}
