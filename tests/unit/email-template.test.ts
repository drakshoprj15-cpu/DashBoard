import { describe, expect, it } from "vitest";

import {
  buildCampaignHtml,
  DEFAULT_CAMPAIGN_TEMPLATE,
  EMAIL_CTA_STYLE,
  isValidCtaUrlTemplate,
  normalizeCtaUrlTemplate,
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
      articleName: "O seu Produto",
      ctaLabel: "Confirmar dados de entrega",
      ctaUrl: "{{CHECKOUT_URL}}",
      vars,
    });

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

  it("renders the header name safely and ignores old logos", () => {
    const html = buildCampaignHtml({
      body: "Olá {{PRIMEIRO_NOME}}.",
      headerName: "Loja <Principal>",
      vars,
      brand: {
        name: "PCDIGA",
        logoUrl: "https://cdn.example.com/logo.png",
      },
    });

    expect(html).toContain("Loja &lt;Principal&gt;");
    expect(html).toContain('color:#cc0000">Loja &lt;Principal&gt;</p>');
    expect(html).not.toContain("PCDIGA");
    expect(html).not.toContain("cdn.example.com/logo.png");
    expect(html).not.toContain("<img");
  });

  it("uses the saved neutral campaign defaults", () => {
    const html = buildCampaignHtml({
      body: DEFAULT_CAMPAIGN_TEMPLATE.body,
      vars,
    });

    expect(html).toContain("O seu pedido encontra-se pendente de conclusão.");
    expect(html).toContain("apenas se reconhecer esta compra.");
    expect(html).toContain("<strong>Artigo:</strong> O seu Produto");
    expect(html).toContain("Continuar para o Pagamento");
    expect(html).toContain(
      "Se o botão não funcionar, copie e cole o seguinte endereço na barra do navegador:",
    );
    expect(html).toContain('href="https://suaempresa.site/pagar/6bzge2a64e"');
  });

  it("accepts a dynamic checkout link and rejects unsafe protocols", () => {
    expect(isValidCtaUrlTemplate("{{CHECKOUT_URL}}")).toBe(true);
    expect(isValidCtaUrlTemplate("https://example.com/p/{{PEDIDO}}")).toBe(
      true,
    );
    expect(isValidCtaUrlTemplate("javascript:alert(1)")).toBe(false);
  });

  it("sends the checkout link over HTTPS even when it was saved as http", () => {
    const html = buildCampaignHtml({
      body: "Olá {{PRIMEIRO_NOME}}.",
      ctaUrl: "{{CHECKOUT_URL}}",
      vars: { ...vars, checkoutUrl: "http://loja.example.com/pagar/abc?x=1" },
    });

    expect(html).not.toContain("http://");
    // Botão e link alternativo apontam para o mesmo endereço seguro.
    expect(
      html.split('href="https://loja.example.com/pagar/abc?x=1"'),
    ).toHaveLength(3);
  });

  it("drops the button when the destination is not a safe web address", () => {
    for (const ctaUrl of [
      "javascript:alert(1)",
      "data:text/html,<p>x</p>",
      "https://banco.example.com@outro.example.net/pagar",
      "ftp://example.com/ficheiro",
    ]) {
      const html = buildCampaignHtml({
        body: "Olá {{PRIMEIRO_NOME}}.",
        ctaLabel: "Ver Pedido",
        ctaUrl,
        vars,
      });
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("Ver Pedido");
    }
  });

  it("renders a red button with the label chosen for the campaign", () => {
    const html = buildCampaignHtml({
      body: "Olá {{PRIMEIRO_NOME}}.",
      ctaLabel: "Ver Pedido <{{PEDIDO}}>",
      ctaUrl: "{{CHECKOUT_URL}}",
      vars,
    });

    expect(EMAIL_CTA_STYLE.background).toBe("#ff0000");
    expect(html).toContain("background:#ff0000;color:#ffffff");
    expect(html).toContain(">Ver Pedido &lt;PED-42&gt;</a>");
  });

  it("normalizes the link template typed in the campaign form", () => {
    expect(normalizeCtaUrlTemplate(" http://loja.pt/pagar/{{PEDIDO}} ")).toBe(
      "https://loja.pt/pagar/{{PEDIDO}}",
    );
    expect(normalizeCtaUrlTemplate("loja.pt/pagar/abc")).toBe(
      "https://loja.pt/pagar/abc",
    );
    expect(normalizeCtaUrlTemplate("//loja.pt/pagar")).toBe(
      "https://loja.pt/pagar",
    );
    expect(normalizeCtaUrlTemplate("{{CHECKOUT_URL}}")).toBe(
      "{{CHECKOUT_URL}}",
    );
    expect(normalizeCtaUrlTemplate("https://loja.pt/x")).toBe(
      "https://loja.pt/x",
    );
    expect(normalizeCtaUrlTemplate("http://localhost:3000/x")).toBe(
      "http://localhost:3000/x",
    );
    expect(isValidCtaUrlTemplate("http://loja.pt/pagar")).toBe(true);
    expect(isValidCtaUrlTemplate("loja.pt/pagar")).toBe(true);
    expect(isValidCtaUrlTemplate("pagar")).toBe(false);
  });
});
