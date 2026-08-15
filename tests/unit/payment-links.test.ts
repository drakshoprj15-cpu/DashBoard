import { describe, expect, it } from "vitest";

import { computeLinkTotal } from "@/features/payment-links/pricing";
import { resolveLinkState } from "@/features/payment-links/types";
import {
  buildPaymentAttemptIdempotencyKey,
  generatePaymentLinkSlug,
} from "@/features/payment-links/slug";
import {
  paymentLinkSchema,
  validateCustomerFields,
  type PaymentLinkCheckoutInput,
} from "@/validations/payment-link";

/**
 * Regras que protegem dinheiro. Se algum destes testes cair, a falha é de
 * segurança ou de cobrança — não de estilo.
 */

const SHIPPING = [
  { id: "std", name: "Entrega padrão", estimate: "2–4 dias", priceCents: 390 },
  {
    id: "exp",
    name: "Entrega expressa",
    estimate: "1–2 dias",
    priceCents: 590,
  },
];

describe("computeLinkTotal", () => {
  it("soma apenas o valor gravado quando o link não pede envio", () => {
    const total = computeLinkTotal(
      { amountCents: 700, requestShipping: false, shippingOptions: SHIPPING },
      "exp",
    );
    expect(total).toEqual({
      subtotal: 700,
      shipping: 0,
      total: 700,
      shippingName: null,
    });
  });

  it("usa o preço de envio do link, nunca um enviado pelo cliente", () => {
    const total = computeLinkTotal(
      { amountCents: 1000, requestShipping: true, shippingOptions: SHIPPING },
      "exp",
    );
    expect(total.shipping).toBe(590);
    expect(total.total).toBe(1590);
    expect(total.shippingName).toBe("Entrega expressa");
  });

  it("cai na primeira opção quando o id de envio é desconhecido", () => {
    // Mandar um id inventado não pode resultar em frete grátis.
    const total = computeLinkTotal(
      { amountCents: 1000, requestShipping: true, shippingOptions: SHIPPING },
      "gratis-forjado",
    );
    expect(total.shipping).toBe(390);
    expect(total.total).toBe(1390);
  });

  it("ignora preço de envio negativo", () => {
    const total = computeLinkTotal(
      {
        amountCents: 500,
        requestShipping: true,
        shippingOptions: [{ id: "x", name: "X", priceCents: -900 }],
      },
      "x",
    );
    expect(total.shipping).toBe(0);
    expect(total.total).toBe(500);
  });
});

describe("resolveLinkState", () => {
  const base = {
    isActive: true,
    archivedAt: null,
    expiresAt: null,
    maxPayments: null,
    paidCount: 0,
  };

  it("um link novo e ativo pode receber pagamentos", () => {
    expect(resolveLinkState(base)).toBe("active");
  });

  it("desativado no painel deixa de aceitar pagamentos", () => {
    expect(resolveLinkState({ ...base, isActive: false })).toBe("paused");
  });

  it("rascunho nunca recebe pagamentos mesmo com flag ativa", () => {
    expect(resolveLinkState({ ...base, status: "draft" })).toBe("draft");
  });

  it("arquivado vence a flag de ativo", () => {
    expect(
      resolveLinkState({ ...base, archivedAt: new Date("2026-01-01") }),
    ).toBe("archived");
  });

  it("expira exatamente no instante marcado", () => {
    const now = new Date("2026-08-14T12:00:00Z");
    expect(resolveLinkState({ ...base, expiresAt: new Date(now), now })).toBe(
      "expired",
    );
    expect(
      resolveLinkState({
        ...base,
        expiresAt: new Date(now.getTime() + 1000),
        now,
      }),
    ).toBe("active");
  });

  it("link de uso único esgota após o primeiro pagamento confirmado", () => {
    expect(resolveLinkState({ ...base, maxPayments: 1, paidCount: 0 })).toBe(
      "active",
    );
    expect(resolveLinkState({ ...base, maxPayments: 1, paidCount: 1 })).toBe(
      "exhausted",
    );
  });

  it("limite personalizado respeita a contagem de aprovados", () => {
    expect(resolveLinkState({ ...base, maxPayments: 3, paidCount: 2 })).toBe(
      "active",
    );
    expect(resolveLinkState({ ...base, maxPayments: 3, paidCount: 3 })).toBe(
      "exhausted",
    );
  });
});

describe("validateCustomerFields", () => {
  const rules = {
    requestName: "required" as const,
    requestEmail: "required" as const,
    requestPhone: "optional" as const,
    requiresAddress: false,
  };

  const input = (
    overrides: Partial<PaymentLinkCheckoutInput>,
  ): PaymentLinkCheckoutInput => ({
    slug: "abc",
    attemptId: "00000000-0000-4000-8000-000000000001",
    method: "multibanco",
    name: "Maria Silva",
    email: "maria@exemplo.pt",
    country: "PT",
    ...overrides,
  });

  it("aceita dados completos", () => {
    expect(validateCustomerFields(input({}), rules)).toEqual([]);
  });

  it("exige telemóvel português para MB WAY, mesmo com telefone opcional", () => {
    const errors = validateCustomerFields(input({ method: "mbway" }), rules);
    expect(errors[0].field).toBe("phone");
  });

  it("recusa telemóvel fixo no MB WAY", () => {
    const errors = validateCustomerFields(
      input({ method: "mbway", phone: "222001079" }),
      rules,
    );
    expect(errors[0].field).toBe("phone");
  });

  it("aceita telemóvel MB WAY em formato local", () => {
    expect(
      validateCustomerFields(
        input({ method: "mbway", phone: "912 345 678" }),
        rules,
      ),
    ).toEqual([]);
  });

  it("exige código postal no formato português quando pede morada", () => {
    const errors = validateCustomerFields(
      input({
        addressLine1: "Rua das Flores 10",
        postalCode: "1234",
        city: "Porto",
      }),
      { ...rules, requiresAddress: true },
    );
    expect(errors.some((e) => e.field === "postalCode")).toBe(true);
  });

  it("aceita morada completa com código postal válido", () => {
    expect(
      validateCustomerFields(
        input({
          addressLine1: "Rua das Flores 10",
          postalCode: "4000-123",
          city: "Porto",
        }),
        { ...rules, requiresAddress: true },
      ),
    ).toEqual([]);
  });

  it("não exige nome quando o link o marca como opcional", () => {
    expect(
      validateCustomerFields(input({ name: "" }), {
        ...rules,
        requestName: "optional",
      }),
    ).toEqual([]);
  });
});

describe("generatePaymentLinkSlug", () => {
  it("evita caracteres ambíguos ao ditar o endereço", () => {
    const slug = generatePaymentLinkSlug(200);
    expect(slug).not.toMatch(/[0O1lI]/);
  });

  it("não repete o mesmo token em execuções seguidas", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generatePaymentLinkSlug()),
    );
    expect(tokens.size).toBe(200);
  });
});

describe("buildPaymentAttemptIdempotencyKey", () => {
  it("é estável para a mesma tentativa e muda entre tentativas", () => {
    const first = buildPaymentAttemptIdempotencyKey("link-1", "attempt-1");
    expect(buildPaymentAttemptIdempotencyKey("link-1", "attempt-1")).toBe(
      first,
    );
    expect(buildPaymentAttemptIdempotencyKey("link-1", "attempt-2")).not.toBe(
      first,
    );
  });
});

describe("paymentLinkSchema", () => {
  const valid = {
    name: "Cobrança #1",
    title: "Pagamento do pedido",
    amountCents: 700,
    currency: "EUR",
    paymentMethods: ["mbway"],
    buttonColor: "#E5097F",
    buttonTextColor: "#FFFFFF",
    borderColor: "#E5E7EB",
  };

  it("aceita a configuração mínima", () => {
    expect(paymentLinkSchema.safeParse(valid).success).toBe(true);
  });

  it("recusa valor abaixo do mínimo do gateway", () => {
    expect(
      paymentLinkSchema.safeParse({ ...valid, amountCents: 50 }).success,
    ).toBe(false);
  });

  it("recusa alias reservado que colidiria com uma rota", () => {
    const result = paymentLinkSchema.safeParse({ ...valid, slug: "checkout" });
    expect(result.success).toBe(false);
  });

  it("recusa expiração no passado", () => {
    const result = paymentLinkSchema.safeParse({
      ...valid,
      expiration: "custom",
      expiresAt: "2020-01-01T10:00",
    });
    expect(result.success).toBe(false);
  });

  it("recusa cobrar envio sem pedir morada", () => {
    const result = paymentLinkSchema.safeParse({
      ...valid,
      requestShipping: true,
      requiresAddress: false,
      shippingOptions: [{ id: "a", name: "Padrão", priceCents: 390 }],
    });
    expect(result.success).toBe(false);
  });

  it("recusa esconder o telefone — MB WAY ficaria impagável", () => {
    const result = paymentLinkSchema.safeParse({
      ...valid,
      requestPhone: "hidden",
      customerFields: [
        { key: "firstName", mode: "required", order: 0 },
        { key: "email", mode: "required", order: 1 },
        { key: "phone", mode: "hidden", order: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("recusa cor fora do formato hexadecimal", () => {
    expect(
      paymentLinkSchema.safeParse({ ...valid, buttonColor: "vermelho" })
        .success,
    ).toBe(false);
  });

  it("recusa redirect com protocolo executável", () => {
    expect(
      paymentLinkSchema.safeParse({
        ...valid,
        success: { redirectUrl: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });

  it("aceita caminho interno seguro na página final", () => {
    expect(
      paymentLinkSchema.safeParse({
        ...valid,
        success: { redirectUrl: "/obrigado" },
      }).success,
    ).toBe(true);
  });

  it("permite ocultar telefone quando só Multibanco está ativo", () => {
    expect(
      paymentLinkSchema.safeParse({
        ...valid,
        paymentMethods: ["multibanco"],
        requestPhone: "hidden",
        customerFields: [
          { key: "firstName", mode: "required", order: 0 },
          { key: "email", mode: "required", order: 1 },
          { key: "phone", mode: "hidden", order: 2 },
        ],
      }).success,
    ).toBe(true);
  });

  it("recusa campos de cliente duplicados", () => {
    expect(
      paymentLinkSchema.safeParse({
        ...valid,
        customerFields: [
          { key: "email", mode: "required", order: 0 },
          { key: "email", mode: "optional", order: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});
