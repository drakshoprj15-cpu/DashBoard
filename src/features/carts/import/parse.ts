/**
 * Leitura de planilhas de carrinhos (CSV e XLSX).
 *
 * O parsing acontece no navegador: o servidor recebe linhas já estruturadas
 * e as revalida (ver `validate.ts` e a rota `/api/carrinhos/import`). Isso
 * evita subir arquivo binário para a função serverless e dá pré-visualização
 * instantânea ao operador.
 *
 * Módulo isomorfo — o CSV é parseado sem dependência nenhuma; XLSX usa
 * `read-excel-file`, carregado sob demanda para não pesar no bundle de quem
 * nunca importa planilha.
 */

/** Colunas aceitas na planilha, na ordem do modelo distribuído ao usuário. */
export const IMPORT_COLUMNS = [
  "nome",
  "email",
  "telefone",
  "cpf",
  "produto",
  "quantidade",
  "valor",
  "status",
  "checkout_url",
  "data_criacao",
  "data_atualizacao",
  "origem",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "observacao",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Linha crua da planilha, já com os cabeçalhos normalizados. */
export type RawRow = Partial<Record<ImportColumn, string>> & {
  /** Número da linha no arquivo original (1 = cabeçalho), para reportar erros. */
  _line: number;
};

/**
 * Identifica uma planilha de contactos enviada por engano no importador de
 * carrinhos. A classificação só acontece quando não há produto nem valor em
 * nenhuma linha e existe pelo menos um e-mail, porque o importador de clientes
 * exige essa coluna. Arquivos mistos continuam no fluxo de carrinhos.
 */
export function countCustomerImportCandidates(rows: RawRow[]): number {
  const hasCartData = rows.some(
    (row) => Boolean(row.produto?.trim()) || Boolean(row.valor?.trim()),
  );
  if (hasCartData) return 0;

  return rows.filter((row) => Boolean(row.email?.trim())).length;
}

/**
 * Sinônimos aceitos por coluna. Planilhas reais vêm de origens diferentes
 * (exportação de gateway, CRM, planilha feita à mão), então aceitar variação
 * de nome evita obrigar o usuário a reescrever o cabeçalho.
 */
const HEADER_ALIASES: Record<ImportColumn, string[]> = {
  nome: [
    "nome",
    "name",
    "cliente",
    "nome do cliente",
    "customer",
    "customer name",
    "comprador",
  ],
  email: ["email", "e-mail", "mail", "email do cliente", "customer email"],
  telefone: [
    "telefone",
    "phone",
    "celular",
    "telemovel",
    "whatsapp",
    "contato",
    "contacto",
  ],
  cpf: ["cpf", "documento", "nif", "doc", "cpf/cnpj", "cpf cnpj"],
  produto: [
    "produto",
    "product",
    "item",
    "nome do produto",
    "product name",
    "oferta",
  ],
  quantidade: ["quantidade", "qtd", "qty", "quantity", "artigos"],
  valor: ["valor", "preco", "price", "amount", "total", "valor total", "vlr"],
  status: ["status", "situacao", "estado", "state"],
  checkout_url: [
    "checkout_url",
    "checkout url",
    "link",
    "url",
    "link do checkout",
    "link de pagamento",
  ],
  data_criacao: [
    "data_criacao",
    "data criacao",
    "criado em",
    "created_at",
    "data",
    "data do pedido",
  ],
  data_atualizacao: [
    "data_atualizacao",
    "data atualizacao",
    "atualizado em",
    "updated_at",
  ],
  origem: ["origem", "source", "origin", "canal"],
  utm_source: ["utm_source", "utm source"],
  utm_campaign: ["utm_campaign", "utm campaign", "campanha"],
  utm_medium: ["utm_medium", "utm medium"],
  observacao: [
    "observacao",
    "observacoes",
    "obs",
    "notes",
    "nota",
    "notas",
    "comentario",
  ],
};

/** Minúsculas, sem acentos, sem espaços duplicados — chave de comparação. */
export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

const COLUMN_BY_ALIAS = new Map<string, ImportColumn>();
for (const [column, aliases] of Object.entries(HEADER_ALIASES) as [
  ImportColumn,
  string[],
][]) {
  for (const alias of aliases)
    COLUMN_BY_ALIAS.set(normalizeHeader(alias), column);
}

/** Resolve um cabeçalho da planilha para uma coluna conhecida (ou null). */
export function resolveColumn(header: string): ImportColumn | null {
  return COLUMN_BY_ALIAS.get(normalizeHeader(header)) ?? null;
}

/**
 * Detecta o separador de um CSV pela primeira linha: conta `;` e `,` fora de
 * aspas e escolhe o mais frequente. Excel em português exporta com `;`.
 */
export function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  let inQuotes = false;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === "," || char === ";" || char === "\t"))
      counts[char] += 1;
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/**
 * Parser CSV conforme RFC 4180: aspas duplas, aspas escapadas por duplicação,
 * quebras de linha dentro do campo e CRLF. Escrito à mão porque o projeto já
 * gera CSV sem dependência (ver `api/carrinhos/export`) e o formato é simples
 * o suficiente para não justificar mais uma lib no bundle.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  // BOM do Excel — precisa sair antes de qualquer comparação de cabeçalho.
  const content = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(content.split(/\r?\n/, 1)[0] ?? "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Converte a matriz da planilha em linhas com colunas resolvidas. */
export function toRawRows(matrix: string[][]): {
  rows: RawRow[];
  unknownHeaders: string[];
} {
  if (matrix.length === 0) return { rows: [], unknownHeaders: [] };

  const [headerRow, ...dataRows] = matrix;
  const unknownHeaders: string[] = [];
  const columnByIndex = headerRow.map((header) => {
    const column = resolveColumn(header);
    if (!column && header.trim()) unknownHeaders.push(header.trim());
    return column;
  });

  const rows = dataRows.map((cells, index) => {
    const row = { _line: index + 2 } as RawRow;
    columnByIndex.forEach((column, i) => {
      if (!column) return;
      const value = (cells[i] ?? "").trim();
      if (value) row[column] = value;
    });
    return row;
  });

  return { rows, unknownHeaders };
}

export interface ParsedSheet {
  rows: RawRow[];
  unknownHeaders: string[];
  /** Colunas conhecidas que a planilha não trouxe — informativo, não erro. */
  missingColumns: ImportColumn[];
}

function summarize(matrix: string[][]): ParsedSheet {
  const { rows, unknownHeaders } = toRawRows(matrix);
  const present = new Set<ImportColumn>();
  for (const row of rows) {
    for (const column of IMPORT_COLUMNS) {
      if (row[column]) present.add(column);
    }
  }
  return {
    rows,
    unknownHeaders,
    missingColumns: IMPORT_COLUMNS.filter((c) => !present.has(c)),
  };
}

export function parseCsvFile(text: string): ParsedSheet {
  return summarize(parseCsv(text));
}

/**
 * Lê um `.xlsx`. `read-excel-file` é importado dinamicamente para ficar fora
 * do bundle inicial da página — só quem abre o diálogo de importação paga
 * por ele.
 */
export async function parseXlsxFile(file: File | Blob): Promise<ParsedSheet> {
  // `readSheet` (e não o export padrão) porque na v9 o padrão devolve a lista
  // de folhas; aqui só interessa a primeira, já como matriz de células.
  const { readSheet } = await import("read-excel-file/browser");
  const matrix = await readSheet(file as File);
  const asStrings = matrix.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date) return cell.toISOString();
      return String(cell);
    }),
  );
  return summarize(asStrings);
}

/** Tamanho e volume máximos aceitos — protege memória do navegador e do servidor. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5_000;

export class ImportFileError extends Error {}

/** Ponto de entrada: decide o parser pela extensão do arquivo. */
export async function parseSheetFile(file: File): Promise<ParsedSheet> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportFileError(
      "Arquivo acima de 5 MB. Divida a planilha em partes menores.",
    );
  }

  const name = file.name.toLowerCase();
  let sheet: ParsedSheet;

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    sheet = await parseXlsxFile(file);
  } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    sheet = parseCsvFile(await file.text());
  } else {
    throw new ImportFileError(
      "Formato não suportado. Envie um arquivo .csv ou .xlsx.",
    );
  }

  if (sheet.rows.length === 0) {
    throw new ImportFileError(
      "A planilha não tem nenhuma linha de dados além do cabeçalho.",
    );
  }
  if (sheet.rows.length > MAX_ROWS) {
    throw new ImportFileError(
      `A planilha tem ${sheet.rows.length} linhas — o limite por importação é ${MAX_ROWS}.`,
    );
  }

  return sheet;
}
