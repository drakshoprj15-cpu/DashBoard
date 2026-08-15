import type { ShippingOptionInput } from "@/validations/payment-link";

/**
 * Cálculo do total de uma cobrança.
 *
 * Módulo puro e sem I/O de propósito: é a regra que impede um preço
 * adulterado no navegador de virar cobrança, e por isso precisa ser
 * testável isoladamente.
 */

export interface PriceableLink {
  amountCents: number;
  requestShipping: boolean;
  shippingOptions: ShippingOptionInput[];
}

export interface LinkTotal {
  subtotal: number;
  shipping: number;
  total: number;
  shippingName: string | null;
}

/**
 * Total = valor gravado no link + preço da forma de envio gravada no link.
 *
 * O que chega do navegador é apenas `shippingOptionId` — um identificador.
 * O preço correspondente sai daqui, do link. Identificador desconhecido cai
 * na primeira opção em vez de zerar o frete: ninguém consegue pedir envio
 * grátis mandando um id inventado.
 */
export function computeLinkTotal(
  link: PriceableLink,
  shippingOptionId: string | undefined,
): LinkTotal {
  const subtotal = link.amountCents;

  if (!link.requestShipping || link.shippingOptions.length === 0) {
    return { subtotal, shipping: 0, total: subtotal, shippingName: null };
  }

  const chosen =
    link.shippingOptions.find((option) => option.id === shippingOptionId) ??
    link.shippingOptions[0];

  const shipping = Math.max(0, chosen.priceCents);

  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
    shippingName: chosen.name,
  };
}
