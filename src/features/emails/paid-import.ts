export const PAID_IMPORT_FIELDS = [
  "name",
  "email",
  "phone",
  "document",
  "product",
  "amount",
  "status",
  "date",
  "origin",
] as const;

export type PaidImportField = (typeof PAID_IMPORT_FIELDS)[number];

export type PaidImportMapping = Record<PaidImportField, number | null>;

export interface ParsedPaidImportCsv {
  headers: string[];
  rows: Array<{ line: number; cells: string[] }>;
  delimiter: "," | ";" | "\t" | "|";
}

export interface PaidImportCandidate {
  line: number;
  email: string;
  name: string | null;
  phone: string | null;
  document: string | null;
  product: string | null;
  amount: string | null;
  status: string;
  purchasedAt: string | null;
  origin: string | null;
  additionalData: Record<string, string>;
}

export interface PaidImportLocalAnalysis {
  totalRecords: number;
  paidRecords: number;
  nonPayingRecords: number;
  validEmails: number;
  invalidEmails: number;
  duplicateRecords: number;
  uniquePaidContacts: number;
  contacts: PaidImportCandidate[];
  errors: Array<{ line: number; message: string }>;
}

const FIELD_ALIASES: Record<PaidImportField, string[]> = {
  name: [
    "nome",
    "nome_completo",
    "cliente",
    "customer_name",
    "full_name",
    "name",
  ],
  email: ["email", "e_mail", "customer_email", "email_cliente"],
  phone: [
    "telefone",
    "telemovel",
    "celular",
    "whatsapp",
    "phone",
    "phone_number",
  ],
  document: ["cpf", "nif", "documento", "document", "tax_id"],
  product: [
    "produto",
    "produto_comprado",
    "nome_do_produto",
    "product",
    "product_name",
  ],
  amount: ["valor", "valor_pago", "total", "amount", "price", "preco"],
  status: [
    "status",
    "status_pagamento",
    "payment_status",
    "situacao",
    "estado",
    "tipo",
  ],
  date: [
    "data",
    "data_pagamento",
    "pago_em",
    "paid_at",
    "purchase_date",
    "created_at",
  ],
  origin: ["origem", "source", "fonte", "plataforma"],
};

const SAFE_PAID_STATUSES = new Set([
  "pago",
  "paga",
  "paid",
  "approved",
  "aprovado",
  "aprovada",
  "complete",
  "completed",
  "concluido",
  "concluida",
  "pagamento_aprovado",
  "pagamento_confirmado",
  "payment_approved",
  "payment_confirmed",
  "pedido_pago",
  "compra_aprovada",
  "compra_confirmada",
  "settled",
  "succeeded",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePaidStatus(value: string): string {
  return normalizedToken(value);
}

export function normalizePaidImportEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') index += 1;
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) count += 1;
  }
  return count;
}

function detectDelimiter(text: string): ParsedPaidImportCsv["delimiter"] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t", "|"] as const;
  return candidates.reduce((best, candidate) =>
    countDelimiter(firstLine, candidate) > countDelimiter(firstLine, best)
      ? candidate
      : best,
  );
}

export function parsePaidImportCsv(
  source: string,
  maxRows = 10_000,
): ParsedPaidImportCsv {
  const text = source.replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("O arquivo CSV está vazio.");

  const delimiter = detectDelimiter(text);
  const parsedRows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) parsedRows.push(row);
      row = [];
      cell = "";
      if (parsedRows.length > maxRows + 1) {
        throw new Error(
          `O limite é de ${maxRows.toLocaleString("pt-BR")} registros por importação.`,
        );
      }
    } else {
      cell += char;
    }
  }

  if (quoted)
    throw new Error("O CSV possui uma célula entre aspas sem fechamento.");
  row.push(cell);
  if (row.some((value) => value.trim())) parsedRows.push(row);

  if (parsedRows.length < 2) {
    throw new Error("O arquivo não possui registros para importar.");
  }

  const headers = parsedRows[0].map((value) => cleanCell(value, 160));
  if (headers.every((value) => !value)) {
    throw new Error("O CSV não possui cabeçalhos válidos.");
  }
  if (parsedRows.length - 1 > maxRows) {
    throw new Error(
      `O limite é de ${maxRows.toLocaleString("pt-BR")} registros por importação.`,
    );
  }

  return {
    headers,
    delimiter,
    rows: parsedRows.slice(1).map((cells, index) => ({
      line: index + 2,
      cells,
    })),
  };
}

export function inferPaidImportMapping(headers: string[]): PaidImportMapping {
  const normalizedHeaders = headers.map(normalizedToken);
  return Object.fromEntries(
    PAID_IMPORT_FIELDS.map((field) => [
      field,
      normalizedHeaders.findIndex((header) =>
        FIELD_ALIASES[field].includes(header),
      ),
    ]).map(([field, index]) => [field, Number(index) >= 0 ? index : null]),
  ) as PaidImportMapping;
}

export function sanitizePaidImportMapping(
  value: unknown,
  columnCount: number,
): PaidImportMapping {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    PAID_IMPORT_FIELDS.map((field) => {
      const index = input[field];
      return [
        field,
        Number.isInteger(index) &&
        Number(index) >= 0 &&
        Number(index) < columnCount
          ? Number(index)
          : null,
      ];
    }),
  ) as PaidImportMapping;
}

function cleanCell(value: unknown, maxLength = 500): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function mappedCell(
  row: { cells: string[] },
  mapping: PaidImportMapping,
  field: PaidImportField,
  maxLength = 500,
): string {
  const index = mapping[field];
  return index === null ? "" : cleanCell(row.cells[index], maxLength);
}

export function paidImportStatusValues(
  csv: ParsedPaidImportCsv,
  mapping: PaidImportMapping,
): Array<{
  value: string;
  normalized: string;
  count: number;
  suggested: boolean;
}> {
  if (mapping.status === null) return [];
  const counts = new Map<string, { value: string; count: number }>();
  for (const row of csv.rows) {
    const value = mappedCell(row, mapping, "status", 120);
    const normalized = normalizePaidStatus(value);
    const current = counts.get(normalized);
    if (current) current.count += 1;
    else counts.set(normalized, { value: value || "(vazio)", count: 1 });
  }
  return Array.from(counts.entries())
    .map(([normalized, item]) => ({
      ...item,
      normalized,
      suggested: SAFE_PAID_STATUSES.has(normalized),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    );
}

function parsedDate(value: string): string | null {
  if (!value) return null;
  const brazilian = value.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  const date = brazilian
    ? new Date(
        Date.UTC(
          Number(brazilian[3]),
          Number(brazilian[2]) - 1,
          Number(brazilian[1]),
          Number(brazilian[4] ?? 0),
          Number(brazilian[5] ?? 0),
          Number(brazilian[6] ?? 0),
        ),
      )
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extraData(
  csv: ParsedPaidImportCsv,
  row: { cells: string[] },
  mapping: PaidImportMapping,
): Record<string, string> {
  const mappedIndexes = new Set(
    Object.values(mapping).filter((value): value is number => value !== null),
  );
  return Object.fromEntries(
    csv.headers.flatMap((header, index) => {
      if (mappedIndexes.has(index)) return [];
      const value = cleanCell(row.cells[index], 500);
      return header && value ? [[header, value] as const] : [];
    }),
  );
}

function mergeCandidates(
  current: PaidImportCandidate,
  incoming: PaidImportCandidate,
): PaidImportCandidate {
  const incomingIsNewer =
    Boolean(incoming.purchasedAt) &&
    (!current.purchasedAt || incoming.purchasedAt! > current.purchasedAt);
  return {
    ...current,
    name: current.name || incoming.name,
    phone: current.phone || incoming.phone,
    document: current.document || incoming.document,
    product: incomingIsNewer
      ? incoming.product || current.product
      : current.product || incoming.product,
    amount: incomingIsNewer
      ? incoming.amount || current.amount
      : current.amount || incoming.amount,
    status: incomingIsNewer ? incoming.status : current.status,
    purchasedAt: incomingIsNewer
      ? incoming.purchasedAt
      : current.purchasedAt || incoming.purchasedAt,
    origin: current.origin || incoming.origin,
    additionalData: { ...incoming.additionalData, ...current.additionalData },
  };
}

export function analyzePaidImportCsv(
  csv: ParsedPaidImportCsv,
  mapping: PaidImportMapping,
  approvedStatusValues: string[],
): PaidImportLocalAnalysis {
  const approved = new Set(
    approvedStatusValues.map(normalizePaidStatus).filter(Boolean),
  );
  const unique = new Map<string, PaidImportCandidate>();
  const errors: Array<{ line: number; message: string }> = [];
  let paidRecords = 0;
  let validEmails = 0;
  let invalidEmails = 0;
  let duplicateRecords = 0;

  for (const row of csv.rows) {
    const rawEmail = mappedCell(row, mapping, "email", 320);
    const email = normalizePaidImportEmail(rawEmail);
    if (email) validEmails += 1;
    else invalidEmails += 1;

    const status = mappedCell(row, mapping, "status", 120);
    if (!approved.has(normalizePaidStatus(status))) continue;
    paidRecords += 1;

    if (!email) {
      errors.push({ line: row.line, message: "E-mail ausente ou inválido." });
      continue;
    }

    const candidate: PaidImportCandidate = {
      line: row.line,
      email,
      name: mappedCell(row, mapping, "name", 240) || null,
      phone: mappedCell(row, mapping, "phone", 80) || null,
      document: mappedCell(row, mapping, "document", 40) || null,
      product: mappedCell(row, mapping, "product", 160) || null,
      amount: mappedCell(row, mapping, "amount", 80) || null,
      status,
      purchasedAt: parsedDate(mappedCell(row, mapping, "date", 80)),
      origin: mappedCell(row, mapping, "origin", 120) || null,
      additionalData: extraData(csv, row, mapping),
    };
    const existing = unique.get(email);
    if (existing) {
      duplicateRecords += 1;
      unique.set(email, mergeCandidates(existing, candidate));
    } else {
      unique.set(email, candidate);
    }
  }

  return {
    totalRecords: csv.rows.length,
    paidRecords,
    nonPayingRecords: csv.rows.length - paidRecords,
    validEmails,
    invalidEmails,
    duplicateRecords,
    uniquePaidContacts: unique.size,
    contacts: Array.from(unique.values()),
    errors: errors.slice(0, 200),
  };
}

export function splitPaidImportName(name: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = cleanCell(name, 240).split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() ?? null,
    lastName: parts.length > 0 ? parts.join(" ") : null,
  };
}

export function paidImportAmountCents(value: string | null): number | null {
  if (!value) return null;
  const compact = value.replace(/[^0-9,.-]/g, "");
  if (!/\d/.test(compact)) return null;
  const decimalSeparator =
    compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
  const normalized =
    decimalSeparator === ","
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100)
    : null;
}
