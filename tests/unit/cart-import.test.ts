import { describe, expect, it } from "vitest";

import {
  detectDelimiter,
  normalizeHeader,
  parseCsv,
  parseCsvFile,
  resolveColumn,
} from "@/features/carts/import/parse";
import {
  parseAmountCents,
  parseSheetDate,
  resolveImportStatus,
  sanitizeCheckoutUrl,
  validateRows,
} from "@/features/carts/import/validate";

describe("detectDelimiter", () => {
  it("prefere ponto-e-vírgula (padrão do Excel em português)", () => {
    expect(detectDelimiter("nome;email;valor")).toBe(";");
  });

  it("reconhece vírgula quando é o separador usado", () => {
    expect(detectDelimiter("nome,email,valor")).toBe(",");
  });

  it("ignora separadores dentro de aspas", () => {
    expect(detectDelimiter('"Silva, Maria",email,valor')).toBe(",");
  });
});

describe("parseCsv", () => {
  it("trata aspas, aspas escapadas e quebras de linha dentro do campo", () => {
    const rows = parseCsv('nome;obs\n"Silva; Maria";"disse ""ok""\nna segunda"');
    expect(rows[1][0]).toBe("Silva; Maria");
    expect(rows[1][1]).toBe('disse "ok"\nna segunda');
  });

  it("lida com CRLF e ignora linhas totalmente vazias", () => {
    expect(parseCsv("a;b\r\n1;2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("normalizeHeader e resolveColumn", () => {
  it("remove acentos, caixa e separadores", () => {
    expect(normalizeHeader("  Observação  ")).toBe("observacao");
    expect(normalizeHeader("UTM_Source")).toBe("utm source");
  });

  it("reconhece sinónimos comuns de cada coluna", () => {
    expect(resolveColumn("Cliente")).toBe("nome");
    expect(resolveColumn("E-mail")).toBe("email");
    expect(resolveColumn("Telemóvel")).toBe("telefone");
    expect(resolveColumn("NIF")).toBe("cpf");
    expect(resolveColumn("Preço")).toBe("valor");
    expect(resolveColumn("Link do checkout")).toBe("checkout_url");
  });

  it("devolve null para cabeçalho desconhecido", () => {
    expect(resolveColumn("coluna inventada")).toBeNull();
  });
});

describe("parseCsvFile", () => {
  it("remove o BOM do Excel antes de comparar cabeçalhos", () => {
    const sheet = parseCsvFile("﻿nome;produto;valor\nMaria;Cadeira;39,90");
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].nome).toBe("Maria");
    expect(sheet.unknownHeaders).toEqual([]);
  });

  it("reporta cabeçalhos ignorados sem falhar a leitura", () => {
    const sheet = parseCsvFile("nome;coluna_estranha\nMaria;x");
    expect(sheet.unknownHeaders).toEqual(["coluna_estranha"]);
    expect(sheet.rows[0].nome).toBe("Maria");
  });

  it("numera as linhas a partir de 2 (1 é o cabeçalho)", () => {
    const sheet = parseCsvFile("nome\nMaria\nJoão");
    expect(sheet.rows.map((r) => r._line)).toEqual([2, 3]);
  });
});

describe("parseAmountCents", () => {
  it("aceita vírgula decimal com e sem separador de milhar", () => {
    expect(parseAmountCents("39,90")).toBe(3990);
    expect(parseAmountCents("1.234,56")).toBe(123456);
  });

  it("aceita ponto decimal no formato inglês", () => {
    expect(parseAmountCents("39.90")).toBe(3990);
    expect(parseAmountCents("1,234.56")).toBe(123456);
  });

  it("aceita inteiros e símbolos de moeda", () => {
    expect(parseAmountCents("39")).toBe(3900);
    expect(parseAmountCents("R$ 39,90")).toBe(3990);
    expect(parseAmountCents("39,90 €")).toBe(3990);
  });

  it("rejeita vazio, texto e valores negativos", () => {
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("grátis")).toBeNull();
    expect(parseAmountCents("-10")).toBeNull();
    expect(parseAmountCents(undefined)).toBeNull();
  });
});

describe("parseSheetDate", () => {
  it("aceita o formato brasileiro/português dd/mm/aaaa", () => {
    expect(parseSheetDate("01/08/2026")?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("aceita ISO", () => {
    expect(parseSheetDate("2026-08-01")?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("rejeita datas absurdas e texto — quase sempre é coluna trocada", () => {
    expect(parseSheetDate("1899-01-01")).toBeNull();
    expect(parseSheetDate("ontem")).toBeNull();
    expect(parseSheetDate(undefined)).toBeNull();
  });
});

describe("resolveImportStatus", () => {
  it("reconhece os status em português com e sem acento", () => {
    expect(resolveImportStatus("Abandonado").status).toBe("abandoned");
    expect(resolveImportStatus("aguardando pagamento").status).toBe("awaiting_payment");
    expect(resolveImportStatus("Pendente").status).toBe("pending");
    expect(resolveImportStatus("Recusado").status).toBe("declined");
  });

  it("status ausente vira abandonado, sem aviso", () => {
    const result = resolveImportStatus(undefined);
    expect(result.status).toBe("abandoned");
    expect(result.warning).toBeUndefined();
  });

  it("rebaixa 'pago'/'convertido' e avisa — receita só vem do gateway", () => {
    for (const raw of ["Pago", "convertido", "Aprovado"]) {
      const result = resolveImportStatus(raw);
      expect(result.status).toBe("awaiting_payment");
      expect(result.warning).toContain("gateway");
    }
  });

  it("status desconhecido vira abandonado com aviso", () => {
    const result = resolveImportStatus("qualquer coisa");
    expect(result.status).toBe("abandoned");
    expect(result.warning).toBeTruthy();
  });
});

describe("sanitizeCheckoutUrl", () => {
  it("aceita http e https", () => {
    expect(sanitizeCheckoutUrl("https://loja.pt/checkout/1")).toBe("https://loja.pt/checkout/1");
  });

  it("rejeita esquemas perigosos e texto solto", () => {
    expect(sanitizeCheckoutUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeCheckoutUrl("data:text/html,<script>")).toBeNull();
    expect(sanitizeCheckoutUrl("nao é url")).toBeNull();
  });
});

describe("validateRows", () => {
  const base = { _line: 2, produto: "Cadeira", valor: "39,90" };

  it("aceita a linha mínima válida", () => {
    const { valid, invalid } = validateRows([{ ...base, nome: "Maria" }]);
    expect(invalid).toHaveLength(0);
    expect(valid[0].productName).toBe("Cadeira");
    expect(valid[0].amountCents).toBe(3990);
    expect(valid[0].status).toBe("abandoned");
  });

  it("exige produto, valor e pelo menos um contacto", () => {
    const { invalid } = validateRows([
      { _line: 2, produto: "Cadeira", valor: "39,90" },
      { _line: 3, nome: "Maria", valor: "39,90" },
      { _line: 4, nome: "Maria", produto: "Cadeira" },
    ]);
    expect(invalid).toHaveLength(3);
    expect(invalid[0].errors.join(" ")).toContain("nome, e-mail ou telefone");
    expect(invalid[1].errors.join(" ")).toContain("Produto");
    expect(invalid[2].errors.join(" ")).toContain("Valor");
  });

  it("recusa e-mail malformado", () => {
    const { invalid } = validateRows([{ ...base, email: "maria(at)exemplo" }]);
    expect(invalid[0].errors.join(" ")).toContain("E-mail inválido");
  });

  it("normaliza o telefone e avisa quando o descarta", () => {
    const ok = validateRows([{ ...base, telefone: "912 345 678" }]);
    expect(ok.valid[0].phone).toBe("+351912345678");

    const bad = validateRows([{ ...base, nome: "Maria", telefone: "123" }]);
    expect(bad.valid[0].phone).toBeNull();
    expect(bad.warnings[0].message).toContain("inválido");
  });

  it("nunca importa uma linha como paga", () => {
    const { valid, warnings } = validateRows([{ ...base, nome: "Maria", status: "Pago" }]);
    expect(valid[0].status).toBe("awaiting_payment");
    expect(warnings[0].message).toContain("gateway");
  });

  it("descarta duplicados dentro da própria planilha", () => {
    const row = { produto: "Cadeira", valor: "39,90", email: "maria@exemplo.com" };
    const { valid, warnings } = validateRows([
      { ...row, _line: 2 },
      { ...row, _line: 3 },
    ]);
    expect(valid).toHaveLength(1);
    expect(warnings.some((w) => w.message.includes("duplicada"))).toBe(true);
  });

  it("distingue duplicados por produto e link de checkout", () => {
    const { valid } = validateRows([
      { _line: 2, produto: "Cadeira", valor: "10", email: "a@b.pt" },
      { _line: 3, produto: "Mesa", valor: "10", email: "a@b.pt" },
    ]);
    expect(valid).toHaveLength(2);
  });

  it("multiplica o valor unitário pela quantidade só na gravação, não na validação", () => {
    const { valid } = validateRows([{ ...base, nome: "Maria", quantidade: "3" }]);
    expect(valid[0].quantity).toBe(3);
    expect(valid[0].amountCents).toBe(3990);
  });

  it("aplica a moeda escolhida no diálogo", () => {
    const { valid } = validateRows([{ ...base, nome: "Maria" }], "BRL");
    expect(valid[0].currency).toBe("BRL");
  });
});
