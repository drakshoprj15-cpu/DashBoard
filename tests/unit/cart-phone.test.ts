import { describe, expect, it } from "vitest";

import { normalizePhone, whatsAppUrl } from "@/features/carts/phone";

describe("normalizePhone", () => {
  it("aceita o formato internacional já correto", () => {
    expect(normalizePhone("+351912345678").e164).toBe("+351912345678");
  });

  it("limpa espaços, hífens e parênteses", () => {
    expect(normalizePhone("+351 912 345 678").e164).toBe("+351912345678");
    expect(normalizePhone("(11) 98765-4321", "55").e164).toBe("+5511987654321");
  });

  it("converte o prefixo internacional antigo 00", () => {
    expect(normalizePhone("00351912345678").e164).toBe("+351912345678");
  });

  it("assume o indicativo padrão quando o número é nacional", () => {
    expect(normalizePhone("912345678").e164).toBe("+351912345678");
    expect(normalizePhone("11987654321", "55").e164).toBe("+5511987654321");
  });

  it("não duplica o indicativo quando ele já vem sem o +", () => {
    expect(normalizePhone("351912345678").e164).toBe("+351912345678");
  });

  it("rejeita números curtos, vazios ou sem dígitos", () => {
    expect(normalizePhone("123").valid).toBe(false);
    expect(normalizePhone("").valid).toBe(false);
    expect(normalizePhone(null).valid).toBe(false);
    expect(normalizePhone("sem numero").valid).toBe(false);
  });

  it("rejeita números acima do limite E.164", () => {
    expect(normalizePhone("+1234567890123456").valid).toBe(false);
  });
});

describe("whatsAppUrl", () => {
  it("monta o link só com dígitos", () => {
    expect(whatsAppUrl("+351 912 345 678")).toBe("https://wa.me/351912345678");
  });

  it("anexa a mensagem codificada", () => {
    const url = whatsAppUrl("912345678", "Olá Maria, tudo bem?");
    expect(url).toContain("https://wa.me/351912345678?text=");
    expect(url).toContain("Ol%C3%A1%20Maria");
  });

  it("devolve null para telefone inutilizável — a UI avisa em vez de abrir um link quebrado", () => {
    expect(whatsAppUrl("123")).toBeNull();
    expect(whatsAppUrl(null)).toBeNull();
  });
});
