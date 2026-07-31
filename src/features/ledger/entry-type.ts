/**
 * Rótulos e cor por tipo de lançamento do livro-caixa (Financeiro →
 * Entradas/Saídas). Fonte única — reaproveitada pela tabela e por qualquer
 * resumo futuro.
 */

export type LedgerEntryType =
  | "sale"
  | "gateway_fee"
  | "refund"
  | "chargeback"
  | "payout"
  | "manual_adjustment"
  | "manual_in"
  | "manual_out"
  | "product_cost"
  | "shipping_cost"
  | "commission"
  | "tax";

export const LEDGER_TYPE_LABEL: Record<LedgerEntryType, string> = {
  sale: "Venda",
  gateway_fee: "Taxa do gateway",
  refund: "Reembolso",
  chargeback: "Chargeback",
  payout: "Repasse",
  manual_adjustment: "Ajuste manual",
  manual_in: "Entrada manual",
  manual_out: "Saída manual",
  product_cost: "Custo de produto",
  shipping_cost: "Custo de envio",
  commission: "Comissão",
  tax: "Imposto",
};

export const LEDGER_TYPE_VARIANT: Record<
  LedgerEntryType,
  "success" | "warning" | "destructive" | "info" | "muted"
> = {
  sale: "success",
  gateway_fee: "warning",
  refund: "destructive",
  chargeback: "destructive",
  payout: "info",
  manual_adjustment: "muted",
  manual_in: "success",
  manual_out: "warning",
  product_cost: "muted",
  shipping_cost: "muted",
  commission: "muted",
  tax: "muted",
};

/** Tipos que só podem ser criados manualmente pela UI. */
export const MANUAL_LEDGER_TYPES = ["manual_in", "manual_out"] as const;
