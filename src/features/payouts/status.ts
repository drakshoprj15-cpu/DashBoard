/**
 * Rótulos e cor por status de repasse — fonte única usada pela página de
 * Repasses.
 */

export type PayoutStatus =
  "upcoming" | "processing" | "paid" | "failed" | "cancelled";

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  upcoming: "Previsto",
  processing: "Em processamento",
  paid: "Pago",
  failed: "Falhou",
  cancelled: "Cancelado",
};

export const PAYOUT_STATUS_VARIANT: Record<
  PayoutStatus,
  "success" | "warning" | "destructive" | "info" | "muted"
> = {
  upcoming: "info",
  processing: "warning",
  paid: "success",
  failed: "destructive",
  cancelled: "muted",
};
