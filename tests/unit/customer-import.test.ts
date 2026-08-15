import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSheetMock } = vi.hoisted(() => ({
  readSheetMock: vi.fn(),
}));

vi.mock("read-excel-file/node", () => ({
  readSheet: readSheetMock,
}));

import {
  parseCustomerCsv,
  parseCustomerImportRows,
} from "@/features/customers/import/parse";

describe("parseCustomerImportRows", () => {
  beforeEach(() => {
    readSheetMock.mockReset();
  });

  it("usa readSheet para devolver as linhas da primeira folha XLSX", async () => {
    const rows = [
      ["nome", "email", "telefone"],
      ["Maria", "maria@exemplo.pt", "+351912345678"],
    ];
    readSheetMock.mockResolvedValue(rows);
    const buffer = Buffer.from("xlsx de teste");

    await expect(parseCustomerImportRows(buffer, "xlsx")).resolves.toEqual(
      rows,
    );
    expect(readSheetMock).toHaveBeenCalledOnce();
    expect(readSheetMock).toHaveBeenCalledWith(buffer);
  });

  it("continua aceitando CSV separado por ponto e vírgula", async () => {
    const buffer = Buffer.from(
      "nome;email;telefone\r\nMaria;maria@exemplo.pt;+351912345678",
      "utf8",
    );

    await expect(parseCustomerImportRows(buffer, "csv")).resolves.toEqual([
      ["nome", "email", "telefone"],
      ["Maria", "maria@exemplo.pt", "+351912345678"],
    ]);
  });
});

describe("parseCustomerCsv", () => {
  it("preserva separadores e aspas dentro de uma célula", () => {
    expect(
      parseCustomerCsv('nome,email\n"Silva, Maria",maria@exemplo.pt'),
    ).toEqual([
      ["nome", "email"],
      ["Silva, Maria", "maria@exemplo.pt"],
    ]);
  });
});
