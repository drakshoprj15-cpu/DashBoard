import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/format";

describe("formatMoney", () => {
  it("formata centavos em BRL", () => {
    // Intl usa espaço não separável entre R$ e o valor
    expect(formatMoney(29700).replace(/ /g, " ")).toBe("R$ 297,00");
  });

  it("formata bigint", () => {
    expect(formatMoney(BigInt(1990)).replace(/ /g, " ")).toBe("R$ 19,90");
  });

  it("suporta outras moedas", () => {
    const result = formatMoney(10050, "EUR", "pt-PT");
    expect(result).toContain("100,50");
    expect(result).toContain("€");
  });
});

describe("formatNumber", () => {
  it("usa separador de milhar pt-BR", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
  });
});

describe("formatPercent", () => {
  it("formata proporção como percentual", () => {
    expect(formatPercent(0.034).replace(/ /g, " ")).toMatch(/3,4\s?%/);
  });
});

describe("datas com fuso determinístico", () => {
  const instant = "2026-01-15T02:30:00.000Z";

  it("usa o horário de Lisboa para pt-PT", () => {
    expect(formatDateTime(instant, "pt-PT")).toContain("02:30");
  });

  it("usa o horário de São Paulo para pt-BR", () => {
    expect(formatDateTime(instant, "pt-BR")).toContain("23:30");
    expect(formatDate(instant, "pt-BR")).toBe("14/01/2026");
  });
});
