import { describe, expect, it } from "vitest";

import {
  mergeAttribution,
  sanitizeAttribution,
  toUtmifyTrackingParameters,
} from "@/features/attribution/utm";

describe("atribuição UTM", () => {
  it("captura src, sck e UTMs, remove controles e limita o tamanho", () => {
    const result = sanitizeAttribution({
      src: " meta\u0000 ",
      sck: "checkout-a",
      utm_source: "x".repeat(250),
      ignored: "secret",
    });
    expect(result.src).toBe("meta");
    expect(result.sck).toBe("checkout-a");
    expect(result.utm_source).toHaveLength(200);
    expect(result).not.toHaveProperty("ignored");
  });

  it("preserva primeira origem e só atualiza última origem com valor válido", () => {
    const first = { utm_source: "facebook", utm_campaign: "primeira" };
    const last = mergeAttribution(first, {
      utm_source: "",
      utm_campaign: "remarketing",
      utm_medium: undefined,
    });
    expect(first).toEqual({ utm_source: "facebook", utm_campaign: "primeira" });
    expect(last).toEqual({ utm_source: "facebook", utm_campaign: "remarketing" });
  });

  it("entrega todas as chaves exigidas pela UTMify com null explícito", () => {
    expect(toUtmifyTrackingParameters({ src: "ad" })).toEqual({
      src: "ad",
      sck: null,
      utm_source: null,
      utm_campaign: null,
      utm_medium: null,
      utm_content: null,
      utm_term: null,
    });
  });
});
