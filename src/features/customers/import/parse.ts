import { readSheet } from "read-excel-file/node";

export type CustomerImportCell = string | number | boolean | Date | null;

/**
 * CSV simples com suporte a delimitador automático, aspas e quebras CRLF.
 * Mantido junto do leitor XLSX para que ambos os formatos entreguem a mesma
 * matriz ao validador da rota.
 */
export function parseCustomerCsv(text: string): CustomerImportCell[][] {
  const delimiter =
    (text.split("\n")[0]?.match(/;/g)?.length ?? 0) >
    (text.split("\n")[0]?.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

/**
 * A exportação padrão do `read-excel-file` v9 devolve as folhas do arquivo.
 * `readSheet` é a API correta para obter as linhas da primeira folha.
 */
export async function parseCustomerImportRows(
  buffer: Buffer,
  extension: "csv" | "xlsx",
): Promise<CustomerImportCell[][]> {
  if (extension === "xlsx") {
    return (await readSheet(buffer)) as unknown as CustomerImportCell[][];
  }

  return parseCustomerCsv(buffer.toString("utf8").replace(/^\uFEFF/, ""));
}
