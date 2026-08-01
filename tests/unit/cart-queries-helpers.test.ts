import { describe, expect, it } from "vitest";

import { clampPage, clampPageSize, sanitizeSearchTerm, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "@/features/carts/queries";

describe("clampPage", () => {
  it("usa 1 como padrão para valores ausentes ou inválidos", () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(null)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage(Number.NaN)).toBe(1);
  });

  it("arredonda para baixo e mantém valores válidos", () => {
    expect(clampPage(3)).toBe(3);
    expect(clampPage(2.9)).toBe(2);
  });
});

describe("clampPageSize", () => {
  it("usa o padrão para valores ausentes ou inválidos", () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(-10)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("nunca ultrapassa o máximo permitido — protege contra carregar tudo de uma vez", () => {
    expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE);
  });

  it("mantém valores válidos dentro do intervalo", () => {
    expect(clampPageSize(50)).toBe(50);
  });
});

describe("sanitizeSearchTerm", () => {
  it("retorna undefined para termos vazios", () => {
    expect(sanitizeSearchTerm(undefined)).toBeUndefined();
    expect(sanitizeSearchTerm(null)).toBeUndefined();
    expect(sanitizeSearchTerm("   ")).toBeUndefined();
  });

  it("escapa curingas do ILIKE para não virarem um curinga de busca", () => {
    expect(sanitizeSearchTerm("50%")).toBe("50\\%");
    expect(sanitizeSearchTerm("a_b")).toBe("a\\_b");
    expect(sanitizeSearchTerm("back\\slash")).toBe("back\\\\slash");
  });

  it("corta termos muito longos", () => {
    const long = "a".repeat(500);
    expect(sanitizeSearchTerm(long)?.length).toBe(120);
  });
});
