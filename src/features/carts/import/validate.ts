/**
 * Validação e normalização das linhas da planilha de carrinhos.
 *
 * Roda duas vezes de propósito: no navegador, para a pré-visualização e os
 * avisos por linha; e de novo no servidor, porque nada que chega do cliente
 * pode ser tratado como confiável.
 *
 * Módulo isomorfo — nunca importa o cliente do banco.
 */
import type { RawRow } from "@/features/carts/import/parse";
import { normalizePhone } from "@/features/carts/phone";

/**
 * Status que a importação pode gravar. "Pago"/"convertido" está deliberadamente
 * de fora: receita no painel é `orders.status in ('paid','shipped','delivered')`
 * e só a confirmação do gateway pode produzi-la. Uma planilha marcando linhas
 * como pagas viraria faturamento inventado no Dashboard e no Financeiro.
 */
export type ImportStatus =
  "abandoned" | "awaiting_payment" | "pending" | "declined";

export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  abandoned: "Abandonado",
  awaiting_payment: "Aguardando pagamento",
  pending: "Pendente",
  declined: "Recusado",
};

/** `orders.status` gravado para cada status de importação. */
export const ORDER_STATUS_BY_IMPORT_STATUS: Record<ImportStatus, string> = {
  abandoned: "awaiting_payment", // "abandonado" é derivado do tempo, não persistido
  awaiting_payment: "awaiting_payment",
  pending: "processing",
  declined: "refused",
};

const STATUS_ALIASES: Record<string, ImportStatus> = {
  abandonado: "abandoned",
  abandonada: "abandoned",
  abandoned: "abandoned",
  "carrinho abandonado": "abandoned",
  aguardando: "awaiting_payment",
  "aguardando pagamento": "awaiting_payment",
  awaiting_payment: "awaiting_payment",
  "awaiting payment": "awaiting_payment",
  aberto: "awaiting_payment",
  criado: "awaiting_payment",
  pendente: "pending",
  pending: "pending",
  processando: "pending",
  processing: "pending",
  "em analise": "pending",
  recusado: "declined",
  recusada: "declined",
  declined: "declined",
  refused: "declined",
  negado: "declined",
  falhou: "declined",
};

/** Status que a planilha pode trazer mas a importação rebaixa, com aviso. */
const DEMOTED_STATUSES = new Set([
  "pago",
  "paga",
  "paid",
  "convertido",
  "convertida",
  "converted",
  "aprovado",
  "aprovada",
  "approved",
  "completo",
  "concluido",
]);

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

export interface StatusResolution {
  status: ImportStatus;
  /** Preenchido quando o status da planilha teve de ser ajustado. */
  warning?: string;
}

/** Resolve o status da planilha; ausente ou desconhecido vira "Abandonado". */
export function resolveImportStatus(raw: string | undefined): StatusResolution {
  if (!raw) return { status: "abandoned" };
  const key = normalizeKey(raw);

  const known = STATUS_ALIASES[key];
  if (known) return { status: known };

  if (DEMOTED_STATUSES.has(key)) {
    return {
      status: "awaiting_payment",
      warning:
        `Status "${raw.trim()}" importado como "Aguardando pagamento": ` +
        "venda paga só é registada pela confirmação do gateway, nunca por planilha.",
    };
  }

  return {
    status: "abandoned",
    warning: `Status "${raw.trim()}" não reconhecido — importado como "Abandonado".`,
  };
}

/**
 * Converte o valor da planilha em centavos. Aceita `39,90`, `39.90`,
 * `1.234,56`, `1,234.56`, `R$ 39,90`, `39` e `3990` (este último só quando
 * não há separador decimal — aí é interpretado como unidades inteiras).
 */
export function parseAmountCents(raw: string | undefined): number | null {
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;

  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // Vírgula é o decimal (pt-BR/pt-PT): remove pontos de milhar.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Ponto é o decimal (en): remove vírgulas de milhar.
    normalized = cleaned.replace(/,/g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100);
}

/** Data da planilha em ISO. Aceita `dd/mm/aaaa`, `aaaa-mm-dd` e ISO completo. */
export function parseSheetDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const value = raw.trim();

  const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Data absurda quase sempre é coluna trocada — melhor ignorar que gravar.
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return date;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** URL de checkout aceitável — só http(s), nunca `javascript:` e afins. */
export function sanitizeCheckoutUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface ValidCartImportRow {
  line: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
  productName: string;
  quantity: number;
  amountCents: number;
  currency: string;
  status: ImportStatus;
  checkoutUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  origin: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  notes: string | null;
  /** Chave de deduplicação: email + telefone + produto + checkout_url. */
  dedupeKey: string;
}

export interface InvalidCartImportRow {
  line: number;
  errors: string[];
  /** Prévia do que a linha trazia, para o operador se localizar na planilha. */
  preview: { name?: string; email?: string; product?: string; amount?: string };
}

export interface ValidationOutcome {
  valid: ValidCartImportRow[];
  invalid: InvalidCartImportRow[];
  /** Avisos por linha (status rebaixado, telefone descartado…). */
  warnings: { line: number; message: string }[];
}

const MAX_TEXT = 200;

function trimText(value: string | undefined, max = MAX_TEXT): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * Chave de deduplicação. Normaliza para que diferenças de caixa e de
 * formatação de telefone não criem duplicado — é a mesma combinação exigida
 * pelo pedido: email + telefone + produto + checkout_url.
 */
export function buildDedupeKey(parts: {
  email: string | null;
  phone: string | null;
  productName: string;
  checkoutUrl: string | null;
}): string {
  return [
    (parts.email ?? "").toLowerCase(),
    parts.phone ?? "",
    normalizeKey(parts.productName),
    (parts.checkoutUrl ?? "").toLowerCase(),
  ].join("|");
}

/**
 * Valida as linhas cruas. Regras mínimas do pedido: pelo menos um contacto
 * (nome, e-mail ou telefone), produto e valor. Status ausente vira
 * "Abandonado".
 */
export function validateRows(
  rows: RawRow[],
  defaultCurrency = "EUR",
): ValidationOutcome {
  const valid: ValidCartImportRow[] = [];
  const invalid: InvalidCartImportRow[] = [];
  const warnings: { line: number; message: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const errors: string[] = [];

    const name = trimText(row.nome);
    const rawEmail = trimText(row.email);
    let email: string | null = null;
    if (rawEmail) {
      if (isValidEmail(rawEmail)) {
        email = rawEmail.toLowerCase();
      } else {
        errors.push(`E-mail inválido: "${rawEmail}".`);
      }
    }

    let phone: string | null = null;
    if (row.telefone) {
      const normalized = normalizePhone(row.telefone);
      if (normalized.valid) {
        phone = normalized.e164;
      } else {
        warnings.push({
          line: row._line,
          message: `Telefone "${row.telefone.trim()}" é inválido e foi ignorado.`,
        });
      }
    }

    if (!name && !email && !phone) {
      errors.push("Informe pelo menos nome, e-mail ou telefone.");
    }

    const productName = trimText(row.produto);
    if (!productName) errors.push("Produto é obrigatório.");

    const amountCents = parseAmountCents(row.valor);
    if (amountCents === null) {
      errors.push(
        row.valor
          ? `Valor inválido: "${row.valor.trim()}".`
          : "Valor é obrigatório.",
      );
    }

    const quantityRaw = Number(
      (row.quantidade ?? "1").replace(/\D/g, "") || "1",
    );
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw > 0
        ? Math.min(quantityRaw, 999)
        : 1;

    const { status, warning } = resolveImportStatus(row.status);
    if (warning) warnings.push({ line: row._line, message: warning });

    let checkoutUrl: string | null = null;
    if (row.checkout_url) {
      checkoutUrl = sanitizeCheckoutUrl(row.checkout_url);
      if (!checkoutUrl) {
        warnings.push({
          line: row._line,
          message: `Link do checkout inválido e ignorado: "${row.checkout_url.trim()}".`,
        });
      }
    }

    if (errors.length > 0 || !productName || amountCents === null) {
      invalid.push({
        line: row._line,
        errors,
        preview: {
          name: name ?? undefined,
          email: rawEmail ?? undefined,
          product: row.produto,
          amount: row.valor,
        },
      });
      continue;
    }

    const dedupeKey = buildDedupeKey({
      email,
      phone,
      productName,
      checkoutUrl,
    });
    if (seen.has(dedupeKey)) {
      warnings.push({
        line: row._line,
        message:
          "Linha duplicada dentro da própria planilha — só a primeira será importada.",
      });
      continue;
    }
    seen.add(dedupeKey);

    const createdAt = parseSheetDate(row.data_criacao);
    const updatedAt = parseSheetDate(row.data_atualizacao);

    valid.push({
      line: row._line,
      name,
      email,
      phone,
      document: trimText(row.cpf, 40),
      productName,
      quantity,
      amountCents,
      currency: defaultCurrency,
      status,
      checkoutUrl,
      createdAt: createdAt ? createdAt.toISOString() : null,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      origin: trimText(row.origem, 60),
      utmSource: trimText(row.utm_source, 60),
      utmCampaign: trimText(row.utm_campaign, 60),
      utmMedium: trimText(row.utm_medium, 60),
      notes: trimText(row.observacao, 500),
      dedupeKey,
    });
  }

  return { valid, invalid, warnings };
}
