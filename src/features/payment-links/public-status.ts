import type { PaymentLinkState } from "@/features/payment-links/types";

export type UnavailablePaymentLinkState = Exclude<PaymentLinkState, "active">;

interface PublicPaymentLinkStatusMessage {
  title: string;
  body: string;
}

const STATUS_MESSAGES: Record<
  UnavailablePaymentLinkState,
  PublicPaymentLinkStatusMessage
> = {
  draft: {
    title: "Este link ainda não foi publicado",
    body: "A cobrança está guardada como rascunho e ainda não aceita pagamentos.",
  },
  paused: {
    title: "Este link está temporariamente indisponível",
    body: "A cobrança foi pausada por quem a criou.",
  },
  archived: {
    title: "Este link foi arquivado",
    body: "A cobrança foi encerrada e já não aceita novos pagamentos.",
  },
  expired: {
    title: "Este link de pagamento expirou",
    body: "O prazo para pagar terminou. Peça um novo link a quem lhe enviou este.",
  },
  exhausted: {
    title: "Pagamento já realizado",
    body: "Esta cobrança já foi paga e não aceita novos pagamentos.",
  },
};

export function getPublicPaymentLinkStatusMessage(
  state: UnavailablePaymentLinkState,
): PublicPaymentLinkStatusMessage {
  return STATUS_MESSAGES[state];
}
