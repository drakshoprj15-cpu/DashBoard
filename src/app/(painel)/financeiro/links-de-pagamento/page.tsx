import type { Metadata } from "next";

import {
  listPaymentLinkDomains,
  listPaymentLinks,
} from "@/features/payment-links/queries";
import { LinksView } from "@/features/payment-links/links-view";
import { DomainsPanel } from "@/features/payment-links/domains-panel";

export const metadata: Metadata = { title: "Financeiro · Link de pagamento" };

export default async function LinksDePagamentoPage(
  props: PageProps<"/financeiro/links-de-pagamento">,
) {
  const searchParams = await props.searchParams;
  const period =
    typeof searchParams.periodo === "string" ? searchParams.periodo : "30d";
  const customFrom =
    typeof searchParams.de === "string" ? searchParams.de : undefined;

  const [{ links, metrics }, domains] = await Promise.all([
    listPaymentLinks(period, customFrom),
    listPaymentLinkDomains(),
  ]);

  return (
    <div className="space-y-5">
      <LinksView links={links} metrics={metrics} period={period} />
      <DomainsPanel domains={domains} />
    </div>
  );
}
