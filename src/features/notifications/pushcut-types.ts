/**
 * Tipos e constantes do Pushcut seguros para o navegador.
 *
 * Vive separado de `pushcut.ts` (server-only, que abre ligação ao banco)
 * pelo mesmo motivo já aplicado em pixels e fretes: um componente cliente
 * que importe destas constantes não pode arrastar o driver `postgres` para
 * o bundle.
 */

export type PushcutSlotKey = "sale_created" | "sale_approved";

export const PUSHCUT_SLOTS: {
  key: PushcutSlotKey;
  label: string;
  description: string;
  defaultName: string;
  defaultEvents: string[];
}[] = [
  {
    key: "sale_created",
    label: "Venda gerada",
    description:
      "Dispara assim que o cliente conclui o checkout e o pagamento é iniciado (ainda por confirmar).",
    defaultName: "Venda gerada",
    defaultEvents: ["order_created"],
  },
  {
    key: "sale_approved",
    label: "Venda aprovada",
    description:
      "Dispara quando o gateway confirma o pagamento — a venda que entra no caixa.",
    defaultName: "Venda aprovada",
    defaultEvents: ["payment_approved"],
  },
];

/** Eventos que podem ser atribuídos a um canal. */
export const PUSHCUT_EVENTS: {
  value: string;
  label: string;
  hint?: string;
}[] = [
  {
    value: "order_created",
    label: "Venda gerada (pagamento iniciado)",
    hint: "MB WAY por confirmar ou referência Multibanco emitida",
  },
  {
    value: "payment_approved",
    label: "Pagamento confirmado",
    hint: "a venda que interessa",
  },
  { value: "payment_refused", label: "Pagamento recusado ou expirado" },
  { value: "refund", label: "Reembolso" },
  { value: "chargeback", label: "Chargeback" },
];

export interface PushcutSlotStatus {
  key: PushcutSlotKey;
  /** Tem webhook guardado */
  configured: boolean;
  notificationName: string;
  events: string[];
  /**
   * Versão mascarada do webhook para exibição (ex.:
   * "https://api.pushcut.io/••••••••/notifications/Venda%20Aprovada").
   * O segredo nunca é devolvido ao navegador.
   */
  maskedUrl: string | null;
}

export const PUSHCUT_WEBHOOK_URL_PLACEHOLDER =
  "https://api.pushcut.io/••••••••/notifications/Nome%20da%20notificação";

export interface PushcutStatus {
  /** Pelo menos um canal com chave guardada */
  configured: boolean;
  isActive: boolean;
  slots: Record<PushcutSlotKey, PushcutSlotStatus>;
  lastEventAt: Date | null;
  lastError: string | null;
}
