import { describe, expect, it } from "vitest";

import { isValidCpf, isValidDocument, isValidPtNif } from "@/lib/document";

describe("isValidPtNif", () => {
  it("aceita um NIF português válido", () => {
    expect(isValidPtNif("500344477")).toBe(true);
  });

  it("rejeita um NIF com dígito de controlo errado", () => {
    expect(isValidPtNif("500344470")).toBe(false);
  });

  it("rejeita tamanho diferente de 9 dígitos", () => {
    expect(isValidPtNif("12345")).toBe(false);
    expect(isValidPtNif("1234567890")).toBe(false);
  });

  it("aceita NIF formatado com espaços", () => {
    expect(isValidPtNif("500 344 477")).toBe(true);
  });
});

describe("isValidCpf", () => {
  it("aceita um CPF válido", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  it("rejeita sequências repetidas (000.000.000-00 etc.)", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejeita dígito verificador incorreto", () => {
    expect(isValidCpf("529.982.247-00")).toBe(false);
  });

  it("rejeita tamanho inválido", () => {
    expect(isValidCpf("123")).toBe(false);
  });
});

describe("isValidDocument", () => {
  it("usa o algoritmo de NIF para Portugal", () => {
    expect(isValidDocument("500344477", "PT")).toBe(true);
    expect(isValidDocument("000000000", "PT")).toBe(false);
  });

  it("usa o algoritmo de CPF para o Brasil", () => {
    expect(isValidDocument("529.982.247-25", "BR")).toBe(true);
    expect(isValidDocument("111.111.111-11", "BR")).toBe(false);
  });

  it("cai numa validação genérica de formato para outros países", () => {
    expect(isValidDocument("AB1234567", "US")).toBe(true);
    expect(isValidDocument("a", "US")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(isValidDocument("", "PT")).toBe(false);
    expect(isValidDocument("   ", "PT")).toBe(false);
  });
});
