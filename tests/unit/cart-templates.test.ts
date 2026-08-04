import { describe, expect, it } from "vitest";

import {
  CART_TEMPLATES,
  buildTemplateVars,
  findMissingVariables,
  renderTemplate,
  suggestTemplate,
} from "@/features/carts/templates";

describe("renderTemplate", () => {
  it("substitui as variáveis pelos valores fornecidos", () => {
    const out = renderTemplate("Olá {{nome}}, o seu {{produto}} custa {{valor}}.", {
      nome: "Maria",
      produto: "Cadeira",
      valor: "39,90 €",
    });
    expect(out).toBe("Olá Maria, o seu Cadeira custa 39,90 €.");
  });

  it("tolera espaços dentro das chaves", () => {
    expect(renderTemplate("Olá {{ nome }}", { nome: "João" })).toBe("Olá João");
  });

  it("nunca deixa o placeholder cru chegar ao cliente", () => {
    const out = renderTemplate("Olá {{nome}}, veja {{checkout_url}}", { nome: "Ana" });
    expect(out).toBe("Olá Ana, veja ");
    expect(out).not.toContain("{{");
  });

  it("ignora variáveis desconhecidas em vez de as manter no texto", () => {
    expect(renderTemplate("Valor: {{inexistente}}", {})).toBe("Valor: ");
  });
});

describe("findMissingVariables", () => {
  it("aponta só as variáveis conhecidas sem valor", () => {
    const missing = findMissingVariables("{{nome}} {{checkout_url}} {{valor}}", {
      nome: "Ana",
      valor: "10 €",
    });
    expect(missing).toEqual(["checkout_url"]);
  });

  it("não reporta nada quando tudo está preenchido", () => {
    expect(findMissingVariables("{{nome}}", { nome: "Ana" })).toEqual([]);
  });

  it("trata string vazia como valor em falta", () => {
    expect(findMissingVariables("{{checkout_url}}", { checkout_url: "" })).toEqual(["checkout_url"]);
  });
});

describe("buildTemplateVars", () => {
  it("formata dinheiro e data e traduz o status", () => {
    const vars = buildTemplateVars({
      customerName: "Maria Silva",
      customerEmail: "maria@exemplo.com",
      customerPhone: "+351912345678",
      productName: "Cadeira Gaming",
      totalCents: 3990,
      currency: "EUR",
      category: "abandoned",
      checkoutUrl: "https://loja.pt/checkout/1",
      createdAt: "2026-08-01T10:00:00.000Z",
    });

    expect(vars.nome).toBe("Maria Silva");
    expect(vars.valor).toContain("39,90");
    expect(vars.status).toBe("Abandonado");
    expect(vars.checkout_url).toBe("https://loja.pt/checkout/1");
    expect(vars.data).toBeTruthy();
  });

  it("converte ausências em string vazia, nunca em 'null'", () => {
    const vars = buildTemplateVars({
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      productName: null,
      totalCents: 0,
      currency: "EUR",
      category: "pending",
      checkoutUrl: null,
      createdAt: new Date(),
    });

    expect(vars.nome).toBe("");
    expect(vars.produto).toBe("");
    expect(vars.checkout_url).toBe("");
  });
});

describe("suggestTemplate", () => {
  it("escolhe o modelo coerente com a categoria do carrinho", () => {
    expect(suggestTemplate("abandoned")).toBe("abandoned");
    expect(suggestTemplate("declined")).toBe("declined");
    expect(suggestTemplate("awaiting_payment")).toBe("pending");
    expect(suggestTemplate("pending")).toBe("pending");
  });

  it("cai num modelo válido para categorias sem sugestão própria", () => {
    expect(CART_TEMPLATES[suggestTemplate("chargeback")]).toBeDefined();
    expect(CART_TEMPLATES[suggestTemplate("paid")]).toBeDefined();
  });
});
