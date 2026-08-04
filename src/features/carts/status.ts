/**
 * Fonte única da verdade para as categorias de status exibidas em
 * Carrinhos: mapeia `orders.status` (já normalizado a partir do gateway
 * pelo webhook — nunca o frontend) para uma categoria de exibição estável,
 * com rótulo em PT e variante de badge. Cards, abas, tabela, exportação e
 * o drawer de detalhes usam só este módulo — nunca duplicar esta lista.
 */

export type CartCategory =
  | "awaiting_payment"
  | "pending"
  | "paid"
  | "recovered"
  | "declined"
  | "abandoned"
  | "expired"
  | "cancelled"
  | "refunded"
  | "chargeback";

/** `orders.status` -> categoria base (antes de aplicar a regra de "abandonado"). */
const BASE_CATEGORY_BY_ORDER_STATUS: Record<string, CartCategory> = {
  created: "awaiting_payment",
  awaiting_payment: "awaiting_payment",
  processing: "pending",
  paid: "paid",
  preparing: "paid",
  shipped: "paid",
  delivered: "paid",
  refused: "declined",
  expired: "expired",
  cancelled: "cancelled",
  refunded: "refunded",
  chargeback: "chargeback",
};

/** Só pedidos ainda sem tentativa de pagamento confirmada podem "abandonar". */
const ABANDONABLE_CATEGORIES: CartCategory[] = ["awaiting_payment"];

/** Horas sem atualização para um pedido "aguardando pagamento" virar "abandonado". */
export const ABANDON_THRESHOLD_HOURS = 24;

/**
 * Categoria de exibição de um pedido, considerando também o tempo sem
 * atualização — um "aguardando pagamento" parado há mais de
 * `ABANDON_THRESHOLD_HOURS` passa a contar como abandonado, sem que isso
 * altere `orders.status` no banco (é só uma leitura derivada).
 *
 * `recoveredManuallyAt` tem precedência sobre tudo menos um pagamento real:
 * é a marcação manual do operador ("recuperei este carrinho por fora"), que
 * nunca vira `orders.status = 'paid'` porque só o gateway confirma receita.
 */
export function resolveCartCategory(
  orderStatus: string,
  hoursSinceUpdate: number,
  recoveredManuallyAt?: Date | string | null,
): CartCategory {
  const base = BASE_CATEGORY_BY_ORDER_STATUS[orderStatus] ?? "awaiting_payment";
  if (base === "paid") return "paid";
  if (recoveredManuallyAt) return "recovered";
  if (
    ABANDONABLE_CATEGORIES.includes(base) &&
    hoursSinceUpdate >= ABANDON_THRESHOLD_HOURS
  ) {
    return "abandoned";
  }
  return base;
}

export const CATEGORY_LABEL: Record<CartCategory, string> = {
  awaiting_payment: "Aguardando pagamento",
  pending: "Pendente",
  paid: "Pago",
  recovered: "Recuperado",
  declined: "Recusado",
  abandoned: "Abandonado",
  expired: "Expirado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  chargeback: "Chargeback",
};

export const CATEGORY_BADGE_VARIANT: Record<
  CartCategory,
  "success" | "warning" | "destructive" | "info" | "muted"
> = {
  paid: "success",
  recovered: "success",
  pending: "info",
  awaiting_payment: "warning",
  declined: "destructive",
  abandoned: "muted",
  expired: "muted",
  cancelled: "destructive",
  refunded: "muted",
  chargeback: "destructive",
};

/** Rótulo PT do status bruto do pedido — exibido no drawer como "status original". */
export const ORDER_STATUS_LABEL: Record<string, string> = {
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

/** Rótulo PT do status bruto retornado pelo provedor de pagamento. */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  created: "Criado",
  pending: "Pendente",
  processing: "Processando",
  approved: "Aprovado",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  partially_refunded: "Parcialmente reembolsado",
  chargeback: "Chargeback",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "Cartão",
  pix: "Pix",
  boleto: "Boleto",
  mbway: "MB WAY",
  multibanco: "Multibanco",
  sepa_debit: "Débito SEPA",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
};

/** Abas da página Carrinhos, na ordem de exibição. */
export type CartTab =
  | "all"
  | "awaiting_payment"
  | "pending"
  | "paid"
  | "recovered"
  | "declined"
  | "abandoned"
  | "reminded"
  | "other";

export const CART_TABS: { key: CartTab; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "abandoned", label: "Abandonados" },
  { key: "awaiting_payment", label: "Aguardando pagamento" },
  { key: "pending", label: "Pendentes" },
  { key: "declined", label: "Recusados" },
  { key: "paid", label: "Pagos" },
  { key: "recovered", label: "Recuperados" },
  { key: "reminded", label: "Lembrete enviado" },
  { key: "other", label: "Outros" },
];

/**
 * Categorias incluídas em cada aba — "other" agrupa os estados residuais.
 * "reminded" não é uma categoria: é um recorte por `last_reminder_sent_at`,
 * transversal a todas elas (por isso fica fora deste mapa).
 */
export const CATEGORIES_BY_TAB: Record<
  Exclude<CartTab, "all" | "reminded">,
  CartCategory[]
> = {
  awaiting_payment: ["awaiting_payment"],
  pending: ["pending"],
  paid: ["paid"],
  recovered: ["recovered"],
  declined: ["declined"],
  abandoned: ["abandoned"],
  other: ["expired", "cancelled", "refunded", "chargeback"],
};

/** Categorias que ainda podem ser recuperadas — habilitam lembrete/disparo. */
export const RECOVERABLE_CATEGORIES: CartCategory[] = [
  "awaiting_payment",
  "pending",
  "abandoned",
  "declined",
];

export function isRecoverableCategory(category: CartCategory): boolean {
  return RECOVERABLE_CATEGORIES.includes(category);
}

const VALID_TABS: readonly string[] = CART_TABS.map((t) => t.key);

export function isCartTab(value: string | null | undefined): value is CartTab {
  return typeof value === "string" && VALID_TABS.includes(value);
}

/**
 * Status para os quais o pedido é considerado "pago" (entra em receita).
 * Reexportado aqui para Carrinhos nunca precisar importar de `features/orders`
 * só por isto.
 */
export const PAID_ORDER_STATUSES = ["paid", "preparing", "shipped", "delivered"];

/**
 * Peso de progressão do status de pedido — usado para nunca deixar uma
 * sincronização/webhook "voltar no tempo" um pedido já confirmado (ex.: um
 * evento atrasado de "pendente" chegando depois de "pago" não pode reverter
 * o pedido). Estados terminais (pago, reembolsado, chargeback, cancelado,
 * expirado) só avançam para outro estado terminal explicitamente permitido.
 */
const ORDER_STATUS_WEIGHT: Record<string, number> = {
  created: 0,
  awaiting_payment: 1,
  processing: 2,
  refused: 3,
  expired: 3,
  cancelled: 3,
  paid: 4,
  preparing: 5,
  shipped: 6,
  delivered: 7,
  refunded: 8,
  chargeback: 8,
};

/**
 * Verdadeiro quando é seguro aplicar `nextStatus` por cima de `currentStatus`
 * — nunca rebaixa um pedido já pago/reembolsado/chargeback para um estado
 * anterior (ex.: "pendente" chegando fora de ordem depois de "pago").
 */
export function canTransitionOrderStatus(
  currentStatus: string,
  nextStatus: string,
): boolean {
  if (currentStatus === nextStatus) return false;
  const current = ORDER_STATUS_WEIGHT[currentStatus] ?? 0;
  const next = ORDER_STATUS_WEIGHT[nextStatus] ?? 0;
  // Refund/chargeback podem sempre suceder um pedido pago, mesmo tendo o
  // mesmo peso de "estados terminais".
  if (
    (nextStatus === "refunded" || nextStatus === "chargeback") &&
    PAID_ORDER_STATUSES.includes(currentStatus)
  ) {
    return true;
  }
  return next > current;
}

/**
 * Tabela central de mapeamento: status de pagamento já normalizado pelo
 * adapter do gateway (`PaymentProviderStatus`) -> `orders.status`. Usada
 * tanto pelo webhook quanto pela sincronização manual — nunca duplicar este
 * mapeamento por gateway.
 */
export const ORDER_STATUS_BY_PAYMENT_STATUS: Record<string, string> = {
  approved: "paid",
  refused: "refused",
  expired: "expired",
  cancelled: "cancelled",
  refunded: "refunded",
  chargeback: "chargeback",
};
