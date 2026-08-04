import { describe, expect, it } from "vitest";

import {
  buildPurchaseEventId,
  normalizeEmail,
  normalizePhoneDigits,
} from "@/features/pixels/meta-capi";

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
