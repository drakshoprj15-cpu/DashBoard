/**
 * Contrato dos adapters de pagamento.
 *
 * O checkout NUNCA depende diretamente da API Broski — apenas desta
 * interface. Neste produto, o catálogo ativo é intencionalmente restrito a
 * MB WAY e Multibanco.
 *
 * Regras invioláveis:
 * - Nunca inventar suporte: `listPaymentMethods` retorna somente o que o
 *   gateway realmente suporta na conta configurada.
 * - Toda criação de pagamento envia `idempotencyKey`.
 * - Todo webhook é verificado com `verifyWebhookSignature` antes de
 *   `parseWebhook`/`handleWebhook`.
 */

export type PaymentMethod = "mbway" | "multibanco";

export type PaymentProviderStatus =
  | "created"
  | "pending"
  | "processing"
  | "approved"
  | "refused"
  | "expired"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "chargeback";

export interface ProviderCredentials {
  environment: "sandbox" | "production";
  /** Chaves específicas do provedor (descriptografadas em runtime) */
  [key: string]: string | undefined;
}

export interface CreatePaymentInput {
  idempotencyKey: string;
  orderId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  customer: {
    id?: string;
    name: string;
    email: string;
    phone?: string;
    document?: string;
    /** Obrigatório em produtos físicos para gateways que exigem morada */
    address?: {
      line1: string;
      line2?: string;
      postalCode: string;
      city: string;
      region?: string;
      country?: string;
    };
  };
  metadata?: Record<string, string>;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PaymentResult {
  externalId: string;
  status: PaymentProviderStatus;
  method: PaymentMethod;
  amountCents: number;
  currency: string;
  /** Dados públicos devolvidos ao comprador para concluir o pagamento. */
  displayData?: {
    multibancoEntity?: string;
    multibancoReference?: string;
    multibancoExpiresAt?: string;
  };
  feeCents?: number;
  failureReason?: string;
  raw?: unknown;
}

export interface CreateCustomerInput {
  name: string;
  email: string;
  phone?: string;
  document?: string;
}

export interface WebhookEvent {
  /** ID do evento no provedor (deduplicação) */
  externalEventId: string;
  type: string;
  paymentExternalId?: string;
  status?: PaymentProviderStatus;
  amountCents?: number;
  raw: unknown;
}

export interface ConnectionTestResult {
  ok: boolean;
  environment: "sandbox" | "production";
  message: string;
  /** Dados da conta retornados pelo gateway (mascarados) */
  accountInfo?: Record<string, string>;
}

export interface PaymentProvider {
  /** Identificador único do adapter (neste produto, "broski"). */
  readonly key: string;
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  getPayment(paymentExternalId: string): Promise<PaymentResult>;
  cancelPayment(paymentExternalId: string): Promise<PaymentResult>;
  refundPayment(
    paymentExternalId: string,
    amountCents?: number,
  ): Promise<PaymentResult>;

  createCustomer(input: CreateCustomerInput): Promise<{ externalId: string }>;

  /** Formas de pagamento REALMENTE suportadas pela conta/ambiente configurados */
  listPaymentMethods(context: {
    currency: string;
    country: string;
  }): Promise<PaymentMethod[]>;

  /** Verifica assinatura do webhook (obrigatório antes de processar) */
  verifyWebhookSignature(request: Request, rawBody: string): Promise<boolean>;
  parseWebhook(rawBody: string): Promise<WebhookEvent>;

  testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Fábrica do provider. O adapter Broski vive em src/payment-providers/broski/.
 */
export type PaymentProviderFactory = (
  credentials: ProviderCredentials,
) => PaymentProvider;
