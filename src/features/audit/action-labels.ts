/**
 * Rótulos em pt-BR por ação registada no livro de auditoria. Fonte única —
 * ações não mapeadas caem no fallback (a string crua), nunca quebram a UI.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "product.created": "Produto criado",
  "product.updated": "Produto atualizado",
  "product.archived": "Produto arquivado",
  "product.activated": "Produto ativado",
  "product.deactivated": "Produto voltou a rascunho",

  "inventory.adjusted": "Estoque ajustado",
  "inventory.min_stock_updated": "Alerta de estoque mínimo atualizado",

  "ledger.manual_entry_created": "Lançamento manual registado",

  "checkout.created": "Checkout criado",
  "checkout.published": "Checkout publicado",
  "checkout.unpublished": "Checkout despublicado",
  "checkout.deleted": "Checkout removido",
  "checkout.duplicated": "Checkout duplicado",

  "customer.marketing_consent_updated": "Consentimento de marketing atualizado",
};

export const ENTITY_TYPE_LABEL: Record<string, string> = {
  product: "Produto",
  inventory: "Estoque",
  ledger_entry: "Lançamento",
  checkout: "Checkout",
  customer: "Cliente",
};

export function actionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABEL[entityType] ?? entityType;
}
