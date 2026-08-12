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
    const out = renderTemplate(
      "Olá {{nome}}, o seu {{produto}} custa {{valor}}.",
      {
        nome: "Maria",
        produto: "Cadeira",
        valor: "39,90 €",
      },
    );
    expect(out).toBe("Olá Maria, o seu Cadeira custa 39,90 €.");
  });

  it("tolera espaços dentro das chaves", () => {
    expect(renderTemplate("Olá {{ nome }}", { nome: "João" })).toBe("Olá João");
  });

  it("nunca deixa o placeholder cru chegar ao cliente", () => {
    const out = renderTemplate("Olá {{nome}}, veja {{checkout_url}}", {
      nome: "Ana",
    });
    expect(out).not.toContain("{{");
  });

  it("ignora variáveis desconhecidas em vez de as manter no texto", () => {
    expect(renderTemplate("Valor: {{inexistente}}", {})).toBe("Valor:");
  });

  it("não deixa o rasto de uma variável vazia — sem nome, a saudação continua natural", () => {
    // Carrinho importado só com e-mail: "Olá , vimos que..." denuncia
    // envio automático logo na primeira palavra.
    expect(renderTemplate("Olá {{nome}}, vimos que o pedido...", {})).toBe(
      "Olá, vimos que o pedido...",
    );
  });

  it("remove parênteses que ficam vazios e espaços duplicados", () => {
    expect(renderTemplate("pedido de Cadeira ({{valor}}) ainda", {})).toBe(
      "pedido de Cadeira ainda",
    );
  });
});

describe("findMissingVariables", () => {
  it("aponta só as variáveis conhecidas sem valor", () => {
    const missing = findMissingVariables(
      "{{nome}} {{checkout_url}} {{valor}}",
      {
        nome: "Ana",
        valor: "10 €",
      },
    );
    expect(missing).toEqual(["checkout_url"]);
  });

  it("não reporta nada quando tudo está preenchido", () => {
    expect(findMissingVariables("{{nome}}", { nome: "Ana" })).toEqual([]);
  });

  it("trata string vazia como valor em falta", () => {
    expect(
      findMissingVariables("{{checkout_url}}", { checkout_url: "" }),
    ).toEqual(["checkout_url"]);
  });
});

describe("buildTemplateVars", () => {
  it("usa só o primeiro nome — nome completo lê-se como mala direta", () => {
    const vars = buildTemplateVars({
      customerName: "Maria Silva Santos",
      customerEmail: null,
      customerPhone: null,
      productName: null,
      totalCents: 0,
      currency: "EUR",
      category: "pending",
      checkoutUrl: null,
      createdAt: new Date(),
    });
    expect(vars.nome).toBe("Maria");
  });

  it("normaliza nome em caixa alta vindo de documento ou planilha", () => {
    const vars = buildTemplateVars({
      customerName: "VICTOR SILVA HUGO",
      customerEmail: null,
      customerPhone: null,
      productName: null,
      totalCents: 0,
      currency: "EUR",
      category: "pending",
      checkoutUrl: null,
      createdAt: new Date(),
    });
    expect(vars.nome).toBe("Victor");
  });

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

    expect(vars.nome).toBe("Maria");
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

  it("sugere o modelo de confirmação para pedidos pagos ou recuperados", () => {
    expect(suggestTemplate("paid")).toBe("paid");
    expect(suggestTemplate("recovered")).toBe("paid");
  });

  it("cai num modelo válido para categorias sem sugestão própria", () => {
    expect(CART_TEMPLATES[suggestTemplate("chargeback")]).toBeDefined();
  });
});

describe("qualidade dos modelos", () => {
  const templates = Object.values(CART_TEMPLATES);

  it("todo modelo tem assunto e prévia de caixa de entrada distintos", () => {
    for (const t of templates) {
      expect(t.subject.length).toBeGreaterThan(0);
      expect(t.preview.length).toBeGreaterThan(0);
      // A prévia estende o assunto — repeti-lo desperdiça a linha.
      expect(t.preview).not.toBe(t.subject);
    }
  });

  it("assunto cabe no que a caixa de entrada mostra sem cortar", () => {
    for (const t of templates) {
      expect(t.subject.length).toBeLessThanOrEqual(60);
    }
  });

  it("mensagem de WhatsApp identifica a marca e oferece saída", () => {
    // O destinatário vê só um número desconhecido: sem marca, parece golpe.
    for (const t of templates) {
      expect(t.whatsappBody).toContain("PCG VIP");
      expect(t.whatsappBody).toContain("PARAR");
    }
  });

  it("WhatsApp de recuperação leva o link do checkout — o de confirmação não precisa", () => {
    for (const t of templates) {
      if (t.hasPaymentCta) {
        expect(t.whatsappBody).toContain("{{checkout_url}}");
      } else {
        expect(t.whatsappBody).not.toContain("{{checkout_url}}");
      }
    }
  });

  it("corpo do e-mail não repete o link — o botão do layout carrega a ação", () => {
    for (const t of templates) {
      expect(t.emailBody).not.toContain("{{checkout_url}}");
    }
  });

  it("e-mail transacional fica curto (abaixo de 125 palavras)", () => {
    for (const t of templates) {
      expect(t.emailBody.split(/\s+/).length).toBeLessThan(125);
    }
  });

  it("só os modelos de pagamento em aberto mostram o botão de pagamento", () => {
    expect(CART_TEMPLATES.pending.hasPaymentCta).toBe(true);
    expect(CART_TEMPLATES.abandoned.hasPaymentCta).toBe(true);
    expect(CART_TEMPLATES.declined.hasPaymentCta).toBe(true);
    expect(CART_TEMPLATES.paid.hasPaymentCta).toBe(false);
  });

  it("modelo de confirmação não menciona pagamento pendente", () => {
    const paid = CART_TEMPLATES.paid;
    expect(paid.emailBody.toLowerCase()).not.toContain("pendente");
    expect(paid.emailBody.toLowerCase()).not.toContain("aguardando");
  });
});
