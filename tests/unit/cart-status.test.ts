import { describe, expect, it } from "vitest";

import {
  ABANDON_THRESHOLD_HOURS,
  canTransitionOrderStatus,
  isCartTab,
  resolveCartCategory,
} from "@/features/carts/status";

describe("resolveCartCategory", () => {
  it("mapeia status recém-criado como aguardando pagamento", () => {
    expect(resolveCartCategory("created", 1)).toBe("awaiting_payment");
    expect(resolveCartCategory("awaiting_payment", 1)).toBe("awaiting_payment");
  });

  it("vira abandonado depois do limiar de horas sem atualização", () => {
    expect(resolveCartCategory("awaiting_payment", ABANDON_THRESHOLD_HOURS - 1)).toBe("awaiting_payment");
    expect(resolveCartCategory("awaiting_payment", ABANDON_THRESHOLD_HOURS)).toBe("abandoned");
    expect(resolveCartCategory("awaiting_payment", ABANDON_THRESHOLD_HOURS + 10)).toBe("abandoned");
  });

  it("processing nunca vira abandonado, mesmo depois de muito tempo", () => {
    expect(resolveCartCategory("processing", 999)).toBe("pending");
  });

  it("mapeia pago/preparando/enviado/entregue para a categoria paga", () => {
    for (const status of ["paid", "preparing", "shipped", "delivered"]) {
      expect(resolveCartCategory(status, 500)).toBe("paid");
    }
  });

  it("mapeia recusado, expirado, cancelado, reembolsado e chargeback", () => {
    expect(resolveCartCategory("refused", 0)).toBe("declined");
    expect(resolveCartCategory("expired", 0)).toBe("expired");
    expect(resolveCartCategory("cancelled", 0)).toBe("cancelled");
    expect(resolveCartCategory("refunded", 0)).toBe("refunded");
    expect(resolveCartCategory("chargeback", 0)).toBe("chargeback");
  });
});

describe("canTransitionOrderStatus", () => {
  it("permite avançar de aguardando pagamento para pago", () => {
    expect(canTransitionOrderStatus("awaiting_payment", "paid")).toBe(true);
  });

  it("nunca deixa um pedido pago voltar para pendente/processando (evento fora de ordem)", () => {
    expect(canTransitionOrderStatus("paid", "processing")).toBe(false);
    expect(canTransitionOrderStatus("paid", "awaiting_payment")).toBe(false);
  });

  it("permite reembolso e chargeback depois de pago", () => {
    expect(canTransitionOrderStatus("paid", "refunded")).toBe(true);
    expect(canTransitionOrderStatus("paid", "chargeback")).toBe(true);
  });

  it("não permite reenviar o mesmo status (idempotência)", () => {
    expect(canTransitionOrderStatus("paid", "paid")).toBe(false);
  });

  it("não deixa reverter um reembolso/chargeback já registado", () => {
    expect(canTransitionOrderStatus("refunded", "paid")).toBe(false);
    expect(canTransitionOrderStatus("chargeback", "paid")).toBe(false);
  });
});

describe("isCartTab", () => {
  it("aceita as abas válidas", () => {
    expect(isCartTab("all")).toBe(true);
    expect(isCartTab("paid")).toBe(true);
    expect(isCartTab("abandoned")).toBe(true);
  });

  it("rejeita valores inválidos ou ausentes", () => {
    expect(isCartTab("qualquer-coisa")).toBe(false);
    expect(isCartTab(null)).toBe(false);
    expect(isCartTab(undefined)).toBe(false);
  });
});
