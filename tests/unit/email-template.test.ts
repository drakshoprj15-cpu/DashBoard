import { describe, expect, it } from "vitest";

import {
  buildCampaignHtml,
  DEFAULT_CAMPAIGN_TEMPLATE,
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
      headerName: "Minha Loja",
      title: "Atualização da encomenda {{PEDIDO}}",
      articleName: "O seu Produto",
      ctaLabel: "Confirmar dados de entrega",
      ctaUrl: "{{CHECKOUT_URL}}",
      vars,
    });

    expect(html).toContain("Minha Loja");
    expect(html).toContain("Maria Oliveira");
    expect(html).toContain("Curso &lt;Avançado&gt;");
    expect(html).toContain("<strong>Encomenda:</strong> PED-42");
    expect(html).toContain("<strong>Artigo:</strong> O seu Produto");
    expect(html).not.toContain("<strong>Valor:</strong>");
    expect(html).not.toContain("49,90 €");
    expect(html).toContain('href="https://example.com/checkout/PED-42"');
    expect(html).toContain("Confirmar dados de entrega");
    expect(html).not.toContain("{{");
  });

  it("allows an empty or custom red email header without a fixed brand", () => {
    const withoutHeader = buildCampaignHtml({
      body: "Olá {{PRIMEIRO_NOME}}.",
      headerName: "",
      vars,
    });
    const customHeader = buildCampaignHtml({
      body: "Olá {{PRIMEIRO_NOME}}.",
      headerName: "Loja <Principal>",
      vars,
    });

    expect(withoutHeader).not.toContain("PCG VIP");
    expect(customHeader).toContain("Loja &lt;Principal&gt;");
    expect(customHeader).toContain("color:#cc0000");
  });

  it("uses the saved neutral campaign defaults", () => {
    const html = buildCampaignHtml({
      body: DEFAULT_CAMPAIGN_TEMPLATE.body,
      vars,
    });

    expect(html).toContain("Sua Empresa");
    expect(html).toContain("O seu pedido encontra-se pendente de conclusão.");
    expect(html).toContain("apenas se reconhecer esta compra.");
    expect(html).toContain("<strong>Artigo:</strong> O seu Produto");
    expect(html).toContain("Continuar para o Pagamento");
    expect(html).toContain(
      "Se o botão não funcionar, copie e cole o seguinte endereço na barra do navegador:",
    );
    expect(DEFAULT_CAMPAIGN_TEMPLATE.ctaUrl).toBe("{{CHECKOUT_URL}}");
    expect(html).toContain('href="https://example.com/checkout/PED-42"');
    expect(html).not.toContain("suaempresa.site");
  });

  it("accepts a dynamic checkout link and rejects unsafe or placeholder URLs", () => {
    expect(isValidCtaUrlTemplate("{{CHECKOUT_URL}}")).toBe(true);
    expect(isValidCtaUrlTemplate("https://example.com/p/{{PEDIDO}}")).toBe(
      true,
    );
    expect(isValidCtaUrlTemplate("javascript:alert(1)")).toBe(false);
    expect(
      isValidCtaUrlTemplate("https://suaempresa.site/pagar/6bzge2a64e"),
    ).toBe(false);
  });

  it("does not render a button for the old placeholder domain", () => {
    const html = buildCampaignHtml({
      body: "Olá {{PRIMEIRO_NOME}}.",
      ctaUrl: "https://suaempresa.site/pagar/6bzge2a64e",
      vars,
    });

    expect(html).not.toContain("suaempresa.site");
    expect(html).not.toContain("Continuar para o Pagamento");
  });
});
