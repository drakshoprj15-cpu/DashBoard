import { describe, expect, it, vi } from "vitest";

import {
  buildUtmifyPayload,
  postUtmifyOrder,
  retryDelayMs,
  UTMIFY_STATUS_BY_ORDER_STATUS,
  type UtmifyOrderSource,
} from "@/features/pixels/utmify-core";

const source: UtmifyOrderSource = {
  reference: "IN-ABC123",
  status: "awaiting_payment",
  paymentMethod: "mbway",
  platform: "Infinity",
  totalCents: 1099,
  gatewayFeeCents: 99,
  netCents: null,
  currency: "EUR",
  createdAt: new Date("2026-08-04T12:34:56.000Z"),
  paidAt: new Date("2026-08-05T13:00:00.000Z"),
  refundedAt: new Date("2026-08-06T14:00:00.000Z"),
  customer: { name: "Cliente", email: "c@example.com", phone: null, document: null, country: "pt", ip: null },
  products: [{ id: "sku-1", name: "Produto", planId: null, planName: null, quantity: 1, priceInCents: 1099 }],
  utm: { src: "meta", sck: "a", utm_source: "facebook" },
};

describe("payload UTMify", () => {
  it("mantém orderId e createdAt entre geração e aprovação", () => {
    const waiting = buildUtmifyPayload(source, "waiting_payment");
    const paid = buildUtmifyPayload({ ...source, status: "paid" }, "paid");
    expect(waiting.orderId).toBe(paid.orderId);
    expect(waiting.createdAt).toBe("2026-08-04 12:34:56");
    expect(paid.createdAt).toBe(waiting.createdAt);
    expect(waiting.approvedDate).toBeNull();
    expect(paid.approvedDate).toBe("2026-08-05 13:00:00");
  });

  it("mapeia MB WAY para pix e Multibanco para boleto", () => {
    expect(buildUtmifyPayload(source).paymentMethod).toBe("pix");
    expect(buildUtmifyPayload({ ...source, paymentMethod: "multibanco" }).paymentMethod).toBe("boleto");
  });

  it("envia reembolso, chargeback, centavos inteiros e UTMs", () => {
    const refund = buildUtmifyPayload(source, "refunded");
    const chargeback = buildUtmifyPayload(source, "chargedback");
    expect(refund.refundedAt).toBe("2026-08-06 14:00:00");
    expect(chargeback.status).toBe("chargedback");
    expect(refund.commission).toMatchObject({ totalPriceInCents: 1099, gatewayFeeInCents: 99, userCommissionInCents: 1000 });
    expect(refund.trackingParameters).toMatchObject({ src: "meta", sck: "a", utm_source: "facebook" });
  });

  it("não inventa mapeamentos para expirado, cancelado ou reembolso parcial", () => {
    expect(UTMIFY_STATUS_BY_ORDER_STATUS.expired).toBeUndefined();
    expect(UTMIFY_STATUS_BY_ORDER_STATUS.cancelled).toBeUndefined();
    expect(UTMIFY_STATUS_BY_ORDER_STATUS.partially_refunded).toBeUndefined();
  });

  it("inclui isTest somente no teste controlado", () => {
    expect(buildUtmifyPayload(source)).not.toHaveProperty("isTest");
    expect(buildUtmifyPayload(source, "waiting_payment", true)).toHaveProperty("isTest", true);
  });
});

describe("cliente e retries UTMify", () => {
  it.each([
    [401, "invalid_token", false],
    [422, "invalid_payload", false],
    [429, "rate_limited", true],
    [500, "unavailable", true],
  ])("classifica HTTP %s sem vazar o token", async (status, code, retryable) => {
    const fetcher = vi.fn(async () => new Response("segredo-da-api", { status })) as unknown as typeof fetch;
    const result = await postUtmifyOrder("token-super-secreto", {}, { fetcher });
    expect(result).toMatchObject({ ok: false, code, retryable });
    expect(JSON.stringify(result)).not.toContain("token-super-secreto");
    expect(JSON.stringify(result)).not.toContain("segredo-da-api");
  });

  it("classifica timeout como temporário", async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
    const result = await postUtmifyOrder("secret", {}, { fetcher, timeoutMs: 1 });
    expect(result).toMatchObject({ code: "timeout", retryable: true });
  });

  it("aplica backoff exponencial com jitter limitado", () => {
    expect(retryDelayMs(1, () => 0)).toBe(24_000);
    expect(retryDelayMs(2, () => 1)).toBe(72_000);
    expect(retryDelayMs(99, () => 0.5)).toBe(3_600_000);
  });
});
