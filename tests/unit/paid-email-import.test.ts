import { describe, expect, it } from "vitest";

import {
  analyzePaidImportCsv,
  inferPaidImportMapping,
  paidImportAmountCents,
  paidImportStatusValues,
  parsePaidImportCsv,
  splitPaidImportName,
} from "@/features/emails/paid-import";

describe("importação de clientes pagantes por CSV", () => {
  it("lê as colunas reais, o separador e células entre aspas", () => {
    const csv = parsePaidImportCsv(
      '\uFEFFNome;Email;Telefone;Tipo\r\n"Ana; Maria"; ANA@EXAMPLE.COM ;+351 912 345 678;Cliente',
    );

    expect(csv.headers).toEqual(["Nome", "Email", "Telefone", "Tipo"]);
    expect(csv.delimiter).toBe(";");
    expect(csv.rows).toHaveLength(1);
    expect(csv.rows[0]).toMatchObject({
      line: 2,
      cells: ["Ana; Maria", " ANA@EXAMPLE.COM ", "+351 912 345 678", "Cliente"],
    });
  });

  it("mapeia somente cabeçalhos existentes e não presume que Cliente seja pago", () => {
    const csv = parsePaidImportCsv(
      "Nome;Email;Telefone;Tipo\nAna;ana@example.com;912345678;Cliente\nBia;bia@example.com;923456789;Lead",
    );
    const mapping = inferPaidImportMapping(csv.headers);
    const statuses = paidImportStatusValues(csv, mapping);

    expect(mapping).toMatchObject({
      name: 0,
      email: 1,
      phone: 2,
      status: 3,
      document: null,
      product: null,
      amount: null,
      date: null,
      origin: null,
    });
    expect(statuses).toEqual([
      { value: "Cliente", normalized: "cliente", count: 1, suggested: false },
      { value: "Lead", normalized: "lead", count: 1, suggested: false },
    ]);
  });

  it("aceita apenas os status aprovados, valida e-mail e deduplica normalizado", () => {
    const csv = parsePaidImportCsv(
      [
        "Nome,Email,Status,Produto,Data,Origem",
        "Ana, ANA@example.com ,Aprovado,Curso,01/09/2026,Milu",
        "Ana Maria,ana@example.com,APROVADO,Curso novo,03/09/2026,Milu",
        "Bia,bia@example.com,Pendente,Curso,02/09/2026,Milu",
        "Caio,email-invalido,Pago,Curso,02/09/2026,Milu",
        "Dora,dora@example.com,Cancelado,Curso,02/09/2026,Milu",
      ].join("\n"),
    );
    const mapping = inferPaidImportMapping(csv.headers);
    const result = analyzePaidImportCsv(csv, mapping, ["Aprovado", "Pago"]);

    expect(result).toMatchObject({
      totalRecords: 5,
      paidRecords: 3,
      nonPayingRecords: 2,
      validEmails: 4,
      invalidEmails: 1,
      duplicateRecords: 1,
      uniquePaidContacts: 1,
    });
    expect(result.contacts[0]).toMatchObject({
      email: "ana@example.com",
      product: "Curso novo",
      purchasedAt: "2026-09-03T00:00:00.000Z",
      origin: "Milu",
    });
    expect(result.errors).toEqual([
      { line: 5, message: "E-mail ausente ou inválido." },
    ]);
  });

  it("permite confirmação explícita de uma nomenclatura ambígua", () => {
    const csv = parsePaidImportCsv(
      "Nome;Email;Tipo\nAna;ana@example.com;Cliente\nBia;bia@example.com;Lead",
    );
    const mapping = inferPaidImportMapping(csv.headers);
    const result = analyzePaidImportCsv(csv, mapping, ["Cliente"]);

    expect(result.paidRecords).toBe(1);
    expect(result.contacts.map((contact) => contact.email)).toEqual([
      "ana@example.com",
    ]);
  });

  it("trata arquivo vazio, CSV inválido e limite de volume", () => {
    expect(() => parsePaidImportCsv("  ")).toThrow("vazio");
    expect(() =>
      parsePaidImportCsv('Nome,Email\n"Ana,ana@example.com'),
    ).toThrow("sem fechamento");
    expect(() =>
      parsePaidImportCsv(
        "Email,Status\na@example.com,Pago\nb@example.com,Pago",
        1,
      ),
    ).toThrow("limite");
  });

  it("processa 3.642 contatos sem perder registros", () => {
    const rows = Array.from(
      { length: 3_642 },
      (_, index) => `Cliente ${index};cliente${index}@example.com;Pago`,
    );
    const csv = parsePaidImportCsv(["Nome;Email;Status", ...rows].join("\n"));
    const result = analyzePaidImportCsv(
      csv,
      inferPaidImportMapping(csv.headers),
      ["Pago"],
    );

    expect(result).toMatchObject({
      totalRecords: 3_642,
      paidRecords: 3_642,
      validEmails: 3_642,
      invalidEmails: 0,
      duplicateRecords: 0,
      uniquePaidContacts: 3_642,
    });
  });

  it("normaliza nome e valores monetários para persistência", () => {
    expect(splitPaidImportName("  Ana   Maria Silva ")).toEqual({
      firstName: "Ana",
      lastName: "Maria Silva",
    });
    expect(paidImportAmountCents("R$ 1.234,56")).toBe(123_456);
    expect(paidImportAmountCents("49.90 EUR")).toBe(4_990);
    expect(paidImportAmountCents("inválido")).toBeNull();
  });
});
