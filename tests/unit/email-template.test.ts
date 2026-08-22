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
    expect(html).toContain('href="https://suaempresa.site/pagar/6bzge2a64e"');
  });

  it("uses the workspace logo in the header when configured", () => {
    const html = buildCampaignHtml({
      body: "Olá {{NOME}}.",
      vars,
      brand: {
        name: "Loja da Maria",
        logoUrl: "https://cdn.example.com/logo.png",
      },
    });

    expect(html).toContain('src="https://cdn.example.com/logo.png"');
    expect(html).toContain('alt="Loja da Maria"');
  });

  it("falls back to the header name when the logo url is unsafe or absent", () => {
    const withoutLogo = buildCampaignHtml({
      body: "Olá {{NOME}}.",
      headerName: "Loja da Maria",
      vars,
      brand: { name: "Loja da Maria", logoUrl: null },
    });
    expect(withoutLogo).toContain("Loja da Maria");
    expect(withoutLogo).not.toContain("<img");

    const unsafeLogo = buildCampaignHtml({
      body: "Olá {{NOME}}.",
      headerName: "Loja da Maria",
      vars,
      brand: { name: "Loja da Maria", logoUrl: "javascript:alert(1)" },
    });
    expect(unsafeLogo).not.toContain("<img");
    expect(unsafeLogo).toContain("Loja da Maria");
  });

  it("accepts a dynamic checkout link and rejects unsafe protocols", () => {
    expect(isValidCtaUrlTemplate("{{CHECKOUT_URL}}")).toBe(true);
    expect(isValidCtaUrlTemplate("https://example.com/p/{{PEDIDO}}")).toBe(
      true,
    );
    expect(isValidCtaUrlTemplate("javascript:alert(1)")).toBe(false);
  });
});
