import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAppUrl } from "@/lib/app-url";
import {
  getPaymentLinkById,
  listCatalogProductsForLinks,
  listPaymentLinkDomains,
  listPaymentLinkPixelIds,
  listPaymentLinkPixels,
} from "@/features/payment-links/queries";
import {
  LinkForm,
  type LinkFormState,
} from "@/features/payment-links/link-form";

export const metadata: Metadata = { title: "Editar link de pagamento" };

/** Data em formato aceite por `<input type="datetime-local">`. */
function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EditarLinkPage(
  props: PageProps<"/financeiro/links-de-pagamento/[id]">,
) {
  const { id } = await props.params;

  const [record, domains, products, pixels, pixelIds] = await Promise.all([
    getPaymentLinkById(id),
    listPaymentLinkDomains(),
    listCatalogProductsForLinks(),
    listPaymentLinkPixels(),
    listPaymentLinkPixelIds(id),
  ]);

  // `getPaymentLinkById` já filtra pelo workspace da sessão: um id de outro
  // workspace cai aqui como "não encontrado".
  if (!record) notFound();

  const initial: LinkFormState = {
    id: record.id,
    status: record.status,
    name: record.name,
    title: record.title,
    description: record.description ?? "",
    amountCents: record.amountCents,
    slug: record.slug,
    showProduct: record.productSnapshot !== null,
    productId: record.productId ?? "",
    productName: record.productSnapshot?.name ?? "",
    productDescription: record.productSnapshot?.description ?? "",
    productImageUrl: record.productSnapshot?.imageUrl ?? "",
    productQuantity: record.productSnapshot?.quantity ?? 1,
    paymentMethods: record.paymentMethods,
    requestName: record.requestName,
    requestEmail: record.requestEmail,
    requestPhone: record.requestPhone,
    requiresAddress: record.requiresAddress,
    requestShipping: record.requestShipping,
    customerFields: record.customerFields,
    shippingOptions: record.shippingOptions.map((option) => ({
      id: option.id,
      name: option.name,
      estimate: option.estimate ?? "",
      priceCents: option.priceCents,
    })),
    logoUrl: record.logoUrl ?? "",
    brand: record.brandConfig,
    appearance: record.appearanceConfig,
    backgroundStyle: record.backgroundStyle,
    buttonText: record.buttonText,
    success: record.successConfig,
    seo: record.seoConfig,
    domainId: record.domainId ?? "",
    metaPixelEnabled: record.metaPixelEnabled,
    pixelIds,
    expiration: record.expiresAt ? "custom" : "never",
    expiresAt: toLocalInput(record.expiresAt),
    usageLimit:
      record.maxPayments === null
        ? "unlimited"
        : record.maxPayments === 1
          ? "single"
          : "custom",
    maxPayments: record.maxPayments ?? 1,
  };

  return (
    <LinkForm
      initial={initial}
      domains={domains}
      products={products}
      pixels={pixels}
      appOrigin={getAppUrl()}
    />
  );
}
