import type {
  ProductSnapshotInput,
  RequestFieldMode,
  ShippingOptionInput,
  CustomerFieldInput,
  PaymentLinkAppearanceInput,
  PaymentLinkBrandInput,
  PaymentLinkMethod,
  PaymentLinkSeoInput,
  PaymentLinkSuccessInput,
} from "@/validations/payment-link";

/**
 * Tipos partilhados entre servidor e componentes de cliente.
 *
 * Sem `import` de banco ou de `node:crypto` aqui de propósito: este módulo é
 * carregado no bundle do navegador junto com o formulário e o preview.
 */

export type PaymentLinkState =
  "active" | "draft" | "paused" | "expired" | "exhausted" | "archived";

export interface PaymentLinkAppearance extends PaymentLinkAppearanceInput {
  /** Campos legados mantidos durante a migração do snapshot. */
  backgroundStyle: "light" | "dark";
  borderColor: string;
  borderRadius: number;
  buttonText: string;
}

export interface PaymentLinkBrand extends PaymentLinkBrandInput {
  logoUrl: string | null;
}

export const DEFAULT_PAYMENT_LINK_BRAND: PaymentLinkBrand = {
  logoUrl: null,
  companyName: "",
  logoSubtitle: "",
  faviconUrl: "",
  logoAlignment: "center",
  logoWidth: 180,
  logoHeight: 64,
  logoSpacing: 24,
};

export const DEFAULT_PAYMENT_LINK_APPEARANCE: PaymentLinkAppearance = {
  backgroundStyle: "light",
  borderColor: "#E5E7EB",
  backgroundType: "solid",
  backgroundColor: "#F6F7F9",
  gradientFrom: "#F6F7F9",
  gradientTo: "#EEEAF5",
  gradientAngle: 135,
  cardColor: "#FFFFFF",
  cardWidth: 460,
  cardRadius: 16,
  cardBorderWidth: 1,
  cardBorderColor: "#E5E7EB",
  cardShadow: "soft",
  cardPadding: 28,
  titleColor: "#18181B",
  textColor: "#71717A",
  titleSize: 22,
  titleWeight: "700",
  inputBackgroundColor: "#FFFFFF",
  inputTextColor: "#18181B",
  inputBorderColor: "#E5E7EB",
  inputRadius: 10,
  inputFocusColor: "#E5097F",
  inputPlaceholderColor: "#A1A1AA",
  buttonColor: "#E5097F",
  buttonHoverColor: "#C8076E",
  buttonTextColor: "#FFFFFF",
  buttonRadius: 10,
  buttonHeight: 52,
  buttonFontSize: 15,
  buttonWeight: "700",
  secondaryButtonText: "Voltar aos dados",
  secondaryButtonColor: "#18181B",
  secondaryButtonBackground: "#FFFFFF",
  secondaryButtonBorderColor: "#E5E7EB",
  securityText: "Pagamento seguro",
  borderRadius: 16,
  buttonText: "Pagar agora",
};

export const DEFAULT_PAYMENT_LINK_SUCCESS: PaymentLinkSuccessInput = {
  title: "Pagamento confirmado",
  description: "Recebemos o seu pagamento.",
  buttonText: "Continuar",
  redirectUrl: "",
  expiredTitle: "Este link de pagamento expirou",
  expiredDescription: "O prazo para pagar terminou. Solicite um novo link.",
};

export const DEFAULT_PAYMENT_LINK_SEO: PaymentLinkSeoInput = {
  browserTitle: "Pagamento",
  description: "",
  faviconUrl: "",
};

export interface PaymentLinkFields {
  requestName: RequestFieldMode;
  requestEmail: RequestFieldMode;
  requestPhone: RequestFieldMode;
  requiresAddress: boolean;
  requestShipping: boolean;
  shippingOptions: ShippingOptionInput[];
  customerFields: CustomerFieldInput[];
}

/**
 * O que a página pública recebe.
 *
 * Deliberadamente sem `workspaceId`, sem credenciais do gateway e sem
 * qualquer campo administrativo: é o objeto serializado para o navegador de
 * quem vai pagar.
 */
export interface PublicPaymentLink {
  slug: string;
  title: string;
  description: string | null;
  amountCents: number;
  currency: string;
  product: ProductSnapshotInput | null;
  paymentMethods: PaymentLinkMethod[];
  brand: PaymentLinkBrand;
  appearance: PaymentLinkAppearance;
  fields: PaymentLinkFields;
  success: PaymentLinkSuccessInput;
  seo: PaymentLinkSeoInput;
}

/** Uma linha da listagem do painel, com o funil já agregado. */
export interface PaymentLinkListItem {
  id: string;
  slug: string;
  name: string;
  title: string;
  url: string;
  domainHostname: string | null;
  amountCents: number;
  currency: string;
  state: PaymentLinkState;
  isActive: boolean;
  expiresAt: string | null;
  maxPayments: number | null;
  createdAt: string;
  productName: string | null;
  views: number;
  paymentsStarted: number;
  paymentsPaid: number;
  pendingPayments: number;
  failedPayments: number;
  revenueCents: number;
  averageTicketCents: number;
  conversionRate: number;
  lastSaleAt: string | null;
}

export interface PaymentLinkMetrics {
  activeLinks: number;
  revenueCents: number;
  paidPayments: number;
  pendingPayments: number;
  failedPayments: number;
  views: number;
  conversionRate: number;
  averageTicketCents: number;
  currency: string;
}

export interface PaymentLinkPaymentRow {
  orderId: string;
  reference: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  method: string | null;
  amountCents: number;
  currency: string;
  status: string;
  providerTransactionId: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** Períodos oferecidos no seletor das métricas. */
export const PERIOD_OPTIONS = [
  { value: "today", label: "Hoje", days: 0 },
  { value: "7d", label: "7 dias", days: 7 },
  { value: "30d", label: "30 dias", days: 30 },
  { value: "90d", label: "90 dias", days: 90 },
] as const;

export type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"] | "custom";

/**
 * Rótulo e cor de cada estado. Uma fonte só, usada pela listagem, pelo
 * detalhe e pela página pública — nunca dois lugares a decidir sozinhos o
 * que "expirado" quer dizer.
 */
export const STATE_LABEL: Record<
  PaymentLinkState,
  { label: string; tone: "success" | "muted" | "warning" | "destructive" }
> = {
  active: { label: "Ativo", tone: "success" },
  draft: { label: "Rascunho", tone: "muted" },
  paused: { label: "Pausado", tone: "muted" },
  expired: { label: "Expirado", tone: "warning" },
  exhausted: { label: "Limite atingido", tone: "warning" },
  archived: { label: "Arquivado", tone: "muted" },
};

/**
 * Estado efetivo de um link. Puro de propósito: a listagem no navegador e o
 * servidor que decide se pode cobrar chegam sempre à mesma conclusão.
 */
export function resolveLinkState(input: {
  isActive: boolean;
  status?: "draft" | "published" | "unpublished" | "archived";
  archivedAt: Date | string | null;
  expiresAt: Date | string | null;
  maxPayments: number | null;
  paidCount: number;
  now?: Date;
}): PaymentLinkState {
  if (input.archivedAt || input.status === "archived") return "archived";
  if (input.status === "draft") return "draft";
  if (!input.isActive || input.status === "unpublished") return "paused";

  const now = input.now ?? new Date();
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  if (input.maxPayments !== null && input.paidCount >= input.maxPayments) {
    return "exhausted";
  }
  return "active";
}
