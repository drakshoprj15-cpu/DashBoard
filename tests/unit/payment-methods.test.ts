import { describe, expect, it } from "vitest";

import { PAYMENT_METHOD_LABEL } from "@/features/carts/status";
import { providerCatalog } from "@/payment-providers/catalog";
import { createCheckoutSchema } from "@/validations/checkout-crud";
import { paymentLinkMethodSchema } from "@/validations/payment-link";

describe("métodos de pagamento ativos", () => {
  it("expõe somente Broski com MB WAY e Multibanco", () => {
    expect(providerCatalog).toHaveLength(1);
    expect(providerCatalog[0]).toMatchObject({
      key: "broski",
      supportedMethods: ["mbway", "multibanco"],
      adapterReady: true,
    });
    expect(PAYMENT_METHOD_LABEL).toEqual({
      mbway: "MB WAY",
      multibanco: "Multibanco",
    });
  });

  it("rejeita cartão nos links e checkouts", () => {
    expect(paymentLinkMethodSchema.safeParse("card").success).toBe(false);

    const result = createCheckoutSchema.safeParse({
      name: "Pagamento teste",
      slug: "pagamento-teste",
      productId: "b8ac1463-a396-4f43-b2ad-13cfcb179562",
      paymentMethods: ["card"],
    });

    expect(result.success).toBe(false);
  });
});
