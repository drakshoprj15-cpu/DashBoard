import { describe, expect, it } from "vitest";

import { resolvePurchaseRule } from "@/features/pixels/rules";

describe("resolvePurchaseRule", () => {
  it("usa o padrão global quando a landing page não tem override", () => {
    expect(resolvePurchaseRule(false, null)).toBe("approved");
    expect(resolvePurchaseRule(true, null)).toBe("generated");
  });

  it("o override da landing page sempre vence o global", () => {
    expect(resolvePurchaseRule(true, false)).toBe("approved");
    expect(resolvePurchaseRule(false, true)).toBe("generated");
  });

  it("override e global concordando dá o mesmo resultado", () => {
    expect(resolvePurchaseRule(true, true)).toBe("generated");
    expect(resolvePurchaseRule(false, false)).toBe("approved");
  });
});
