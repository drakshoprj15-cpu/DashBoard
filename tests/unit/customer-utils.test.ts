import { describe, expect, it } from "vitest";

import {
  buildCustomerStatuses,
  calculateNetSpent,
  maskDocument,
  maskPhone,
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
  parseCustomerFilters,
  resolveDuplicateCandidate,
  sanitizeCsvCell,
} from "@/features/customers/customer-utils";
import { consumeCustomerRateLimit } from "@/features/customers/rate-limit";

describe("normalização de clientes", () => {
  it("normaliza e valida email, telefone e documento", () => {
    expect(normalizeEmail("  Cliente@Exemplo.COM ")).toBe(
      "cliente@exemplo.com",
    );
    expect(normalizeEmail("email-invalido")).toBeNull();
    expect(normalizePhone("+55 (21) 99999-0000")).toBe("+5521999990000");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizeDocument("123.456.789-01")).toBe("12345678901");
    expect(maskDocument("12345678901")).toMatch(/^123\./);
    expect(maskPhone("+55 21 99999-0000")).toMatch(/^\+55 .*00$/);
    expect(maskPhone("+55 21 99999-0000")).not.toContain("99999");
  });

  it("calcula gasto líquido sem permitir total negativo", () => {
    expect(
      calculateNetSpent({
        approvedCents: 25_000,
        refundedCents: 5_000,
        chargebackCents: 1_000,
      }),
    ).toBe(19_000);
    expect(
      calculateNetSpent({
        approvedCents: 1_000,
        refundedCents: 2_000,
        chargebackCents: 0,
      }),
    ).toBe(0);
  });

  it("protege a exportação CSV contra fórmulas e escapa aspas", () => {
    expect(sanitizeCsvCell('=HYPERLINK("https://exemplo.com")')).toBe(
      '"\'=HYPERLINK(""https://exemplo.com"")"',
    );
    expect(sanitizeCsvCell('Cliente "VIP"')).toBe('"Cliente ""VIP"""');
  });

  it("deduplica por documento, depois email e telefone, nunca por nome", () => {
    const candidates = [
      {
        id: "email",
        normalizedEmail: "cliente@exemplo.com",
        normalizedPhone: "5511999990000",
        normalizedDocument: null,
      },
      {
        id: "documento",
        normalizedEmail: "outro@exemplo.com",
        normalizedPhone: null,
        normalizedDocument: "12345678901",
      },
    ];
    expect(
      resolveDuplicateCandidate(candidates, {
        normalizedEmail: "cliente@exemplo.com",
        normalizedPhone: null,
        normalizedDocument: "12345678901",
      })?.id,
    ).toBe("documento");
    expect(
      resolveDuplicateCandidate(candidates, {
        normalizedEmail: "novo@exemplo.com",
        normalizedPhone: null,
        normalizedDocument: null,
      }),
    ).toBeNull();
  });
});

describe("filtros e classificação de clientes", () => {
  it("limita valores inválidos e converte valores monetários para centavos", () => {
    const filters = parseCustomerFilters(
      new URLSearchParams(
        "page=-3&pageSize=999&sort=invalido&type=invalido&minSpent=10,50&hasEmail=true",
      ),
    );
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(20);
    expect(filters.sort).toBe("activity_desc");
    expect(filters.type).toBe("all");
    expect(filters.minSpent).toBe(1_050);
    expect(filters.hasEmail).toBe("true");
  });

  it("preserva filtros combinados de CRM na URL", () => {
    const filters = parseCustomerFilters(
      new URLSearchParams(
        "landingPageId=11111111-1111-1111-1111-111111111111&campaignId=22222222-2222-2222-2222-222222222222&emailValid=true&phoneValid=true&hasAbandoned=true&hasPending=true&lastOrderFrom=2026-01-01&lastOrderTo=2026-01-31&minOrders=2&maxOrders=10",
      ),
    );
    expect(filters).toMatchObject({
      emailValid: "true",
      phoneValid: "true",
      hasAbandoned: "true",
      hasPending: "true",
      lastOrderFrom: "2026-01-01",
      lastOrderTo: "2026-01-31",
      minOrders: 2,
      maxOrders: 10,
    });
  });

  it("identifica lead, comprador recorrente e sinais de recuperação", () => {
    expect(
      buildCustomerStatuses({
        paidCount: 0,
        pendingCount: 0,
        refusedCount: 0,
        abandonedCarts: 0,
      }).map((status) => status.key),
    ).toEqual(["lead"]);

    expect(
      buildCustomerStatuses({
        paidCount: 2,
        pendingCount: 1,
        refusedCount: 1,
        abandonedCarts: 1,
      }).map((status) => status.key),
    ).toEqual(["buyer", "recurring", "abandoned", "pending", "refused"]);
  });
});

describe("limite de operações pesadas", () => {
  it("bloqueia ao atingir o limite e libera após a janela", () => {
    const key = `teste-${crypto.randomUUID()}`;
    expect(consumeCustomerRateLimit(key, 2, 1_000, 0).allowed).toBe(true);
    expect(consumeCustomerRateLimit(key, 2, 1_000, 1).allowed).toBe(true);
    const blocked = consumeCustomerRateLimit(key, 2, 1_000, 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(consumeCustomerRateLimit(key, 2, 1_000, 1_001).allowed).toBe(true);
  });
});
