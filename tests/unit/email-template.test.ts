import { describe, expect, it } from "vitest";

import {
  buildCampaignHtml,
  isValidCtaUrlTemplate,
  renderCampaignText,
  type CampaignTemplateVars,
} from "@/features/emails/template";

const vars: CampaignTemplateVars = {
  nome: "Maria Oliveira",
  primeiroNome: "Maria",
  email: "maria@example.com",
  produto: "Curso <Avançado>",
  pedido: "PED-42",
  valor: "49,90 €",
  checkoutUrl: "https://example.com/checkout/PED-42",
  lojaUrl: "https://example.com",
};

describe("email campaign template", () => {
  it("renders current and legacy cart variables", () => {
    expect(
      renderCampaignText(
        "Olá {{PRIMEIRO_NOME}}, pedido {{PEDIDO}}: {{produto}} por {{valor}}.",
        vars,
      ),
    ).toBe("Olá Maria, pedido PED-42: Curso <Avançado> por 49,90 €.");
  });

  it("escapes customer data and adds the checkout action", () => {
    const html = buildCampaignHtml({
      body: "Olá {{NOME}}, o seu {{PRODUTO}} está reservado.",
      preheader: "Retome o pedido {{PEDIDO}}.",
      title: "Atualização da encomenda {{PEDIDO}}",
      ctaLabel: "Confirmar dados de entrega",
      ctaUrl: "{{CHECKOUT_URL}}",
      vars,
    });

    expect(html).toContain("PCG VIP");
    expect(html).toContain("Maria Oliveira");
    expect(html).toContain("Curso &lt;Avançado&gt;");
    expect(html).toContain('href="https://example.com/checkout/PED-42"');
    expect(html).toContain("Confirmar dados de entrega");
    expect(html).not.toContain("{{");
  });

  it("accepts a dynamic checkout link and rejects unsafe protocols", () => {
    expect(isValidCtaUrlTemplate("{{CHECKOUT_URL}}")).toBe(true);
    expect(isValidCtaUrlTemplate("https://example.com/p/{{PEDIDO}}")).toBe(
      true,
    );
    expect(isValidCtaUrlTemplate("javascript:alert(1)")).toBe(false);
  });
});
