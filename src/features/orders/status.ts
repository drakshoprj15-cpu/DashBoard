/**
 * Fonte única da verdade para status de pedido: rótulo em pt-BR, cor do
 * badge e o subconjunto considerado "pago" para fins de receita/métricas.
 * Usado por Pedidos e pela Dashboard — nunca duplicar esta lista.
 */

/** Pedido com pagamento efetivamente confirmado (entra em receita/ticket médio). */
export const PAID_STATUSES = ["paid", "shipped", "delivered"] as const;

export const STATUS_LABEL: Record<string, string> = {
  created: "Criado",
  awaiting_payment: "Aguardando pagamento",
  processing: "Em processamento",
  paid: "Pago",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  preparing: "Em preparação",
  shipped: "Enviado",
  delivered: "Entregue",
  refunded: "Reembolsado",
  chargeback: "Chargeback",
};

export const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "info" | "muted"
> = {
  paid: "success",
  delivered: "success",
  awaiting_payment: "warning",
  created: "warning",
  processing: "info",
  shipped: "info",
  refused: "destructive",
  cancelled: "destructive",
  chargeback: "destructive",
  expired: "muted",
  refunded: "muted",
};
