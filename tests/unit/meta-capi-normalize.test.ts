import { describe, expect, it } from "vitest";

import {
  buildCustomData,
  buildPurchaseEventId,
  buildUserData,
  isRetryableMetaStatus,
  normalizeEmail,
  normalizePhoneDigits,
} from "@/features/pixels/meta-capi";

const basePurchase = {
  workspaceId: "workspace-a",
  orderId: "order-a",
  eventId: "purchase_order-a",
  triggerType: "payment_approved" as const,
  valueCents: 12990,
  currency: "EUR",
};

describe("normalizeEmail", () => {
  it("remove espaços e converte para minúsculas antes do hash", () => {
    expect(normalizeEmail("  Ana@Exemplo.COM  ")).toBe("ana@exemplo.com");
  });
});

describe("normalizePhoneDigits", () => {
  it("mantém só os dígitos, removendo formatação", () => {
    expect(normalizePhoneDigits("+351 912 345 678")).toBe("351912345678");
    expect(normalizePhoneDigits("(11) 91234-5678")).toBe("11912345678");
  });
});

describe("buildPurchaseEventId", () => {
  it("é estável para o mesmo pedido — condição da dedupe Pixel x CAPI", () => {
    const orderId = "11111111-1111-1111-1111-111111111111";
    expect(buildPurchaseEventId(orderId)).toBe(buildPurchaseEventId(orderId));
    expect(buildPurchaseEventId(orderId)).toBe(`purchase_${orderId}`);
  });

  it("pedidos diferentes geram event_id diferentes", () => {
    const a = buildPurchaseEventId("order-a");
    const b = buildPurchaseEventId("order-b");
    expect(a).not.toBe(b);
  });
});

describe("payload da Conversions API", () => {
  it("envia valor numérico, moeda, itens e quantidade reais do pedido", () => {
    expect(
      buildCustomData({
        ...basePurchase,
        contentIds: ["SKU-PRETO-M"],
        productName: "Produto — Preto / M",
        quantity: 2,
      }),
    ).toMatchObject({
      value: 129.9,
      currency: "EUR",
      order_id: "order-a",
      content_ids: ["SKU-PRETO-M"],
      content_type: "product",
      num_items: 2,
    });
  });

  it("normaliza e aplica hash aos dados pessoais, preservando fbp/fbc", () => {
    const data = buildUserData({
      ...basePurchase,
      email: " ANA@EXEMPLO.COM ",
      phone: "+351 912 345 678",
      firstName: " Ana ",
      fbp: "fb.1.browser",
      fbc: "fb.1.click",
    });

    expect(data.em?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(data.ph?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(data.fn?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(data.fbp).toBe("fb.1.browser");
    expect(data.fbc).toBe("fb.1.click");
  });

  it("repete apenas erros transitórios ou de rede", () => {
    expect(isRetryableMetaStatus(0)).toBe(true);
    expect(isRetryableMetaStatus(429)).toBe(true);
    expect(isRetryableMetaStatus(503)).toBe(true);
    expect(isRetryableMetaStatus(400)).toBe(false);
    expect(isRetryableMetaStatus(401)).toBe(false);
  });
});
