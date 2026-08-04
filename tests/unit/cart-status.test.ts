import { describe, expect, it } from "vitest";

import {
  ABANDON_THRESHOLD_HOURS,
  canTransitionOrderStatus,
  isCartTab,
  isConvertedCategory,
  isEmailableCategory,
  isRecoverableCategory,
  resolveCartCategory,
} from "@/features/carts/status";

describe("resolveCartCategory", () => {
  it("mapeia status recém-criado como aguardando pagamento", () => {
    expect(resolveCartCategory("created", 1)).toBe("awaiting_payment");
    expect(resolveCartCategory("awaiting_payment", 1)).toBe("awaiting_payment");
  });

  it("vira abandonado depois do limiar de horas sem atualização", () => {
    expect(
      resolveCartCategory("awaiting_payment", ABANDON_THRESHOLD_HOURS - 1),
    ).toBe("awaiting_payment");
    expect(
      resolveCartCategory("awaiting_payment", ABANDON_THRESHOLD_HOURS),
    ).toBe("abandoned");
    expect(
      resolveCartCategory("awaiting_payment", ABANDON_THRESHOLD_HOURS + 10),
    ).toBe("abandoned");
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

  it("marcação manual de recuperação tem precedência sobre abandono e recusa", () => {
    const at = new Date();
    expect(resolveCartCategory("awaiting_payment", 999, at)).toBe("recovered");
    expect(resolveCartCategory("refused", 0, at)).toBe("recovered");
    expect(resolveCartCategory("processing", 0, at)).toBe("recovered");
  });

  it("pagamento confirmado pelo gateway vence a marcação manual", () => {
    // "Pago" vem do webhook e é o que alimenta a receita — uma marcação
    // manual nunca pode mascarar uma venda real já confirmada.
    expect(resolveCartCategory("paid", 0, new Date())).toBe("paid");
    expect(resolveCartCategory("delivered", 0, new Date())).toBe("paid");
  });

  it("sem marcação manual, o comportamento antigo permanece", () => {
    expect(resolveCartCategory("awaiting_payment", 999, null)).toBe(
      "abandoned",
    );
    expect(resolveCartCategory("awaiting_payment", 999, undefined)).toBe(
      "abandoned",
    );
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

describe("isEmailableCategory", () => {
  it("libera e-mail para quem ainda pode ser recuperado", () => {
    for (const category of [
      "awaiting_payment",
      "pending",
      "abandoned",
      "declined",
    ] as const) {
      expect(isEmailableCategory(category)).toBe(true);
      expect(isRecoverableCategory(category)).toBe(true);
    }
  });

  it("libera e-mail para quem já converteu — pago ou marcado como recuperado", () => {
    // O pedido de "mandar e-mail para quem pagou" depende disto: pago não
    // era mais recuperável, mas continua elegível para receber e-mail.
    expect(isEmailableCategory("paid")).toBe(true);
    expect(isEmailableCategory("recovered")).toBe(true);
    expect(isConvertedCategory("paid")).toBe(true);
    expect(isConvertedCategory("recovered")).toBe(true);
  });

  it("bloqueia e-mail para os estados residuais sem template — expirado, cancelado, reembolsado, chargeback", () => {
    for (const category of [
      "expired",
      "cancelled",
      "refunded",
      "chargeback",
    ] as const) {
      expect(isEmailableCategory(category)).toBe(false);
    }
  });

  it("recuperável e convertido nunca se sobrepõem", () => {
    const categories: (
      | "awaiting_payment"
      | "pending"
      | "paid"
      | "recovered"
      | "declined"
      | "abandoned"
      | "expired"
      | "cancelled"
      | "refunded"
      | "chargeback"
    )[] = [
      "awaiting_payment",
      "pending",
      "paid",
      "recovered",
      "declined",
      "abandoned",
      "expired",
      "cancelled",
      "refunded",
      "chargeback",
    ];
    for (const category of categories) {
      expect(
        isRecoverableCategory(category) && isConvertedCategory(category),
      ).toBe(false);
    }
  });
});
