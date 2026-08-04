import { getDb, isDatabaseConfigured } from "@/database/client";
import { cartEvents } from "@/database/schema";

export type CartEventType =
  | "created"
  | "status_changed"
  | "email_sent"
  | "whatsapp_opened"
  | "imported"
  | "exported"
  | "archived"
  | "reminder_failed";

export type CartEventChannel = "email" | "whatsapp";

export interface RecordCartEventInput {
  workspaceId: string;
  orderId: string;
  type: CartEventType;
  channel?: CartEventChannel;
  /** Resumo curto e legível — nunca o corpo da mensagem nem dados sensíveis. */
  message?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

/**
 * Regista um evento da central de recuperação no histórico do carrinho.
 *
 * Nunca pode quebrar a ação que a chamou — mesma postura de
 * `features/audit/log.ts`: uma falha aqui vira log de console, não erro para
 * o operador que acabou de enviar um lembrete com sucesso.
 */
export async function recordCartEvent(input: RecordCartEventInput): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    const db = getDb();
    await db.insert(cartEvents).values({
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      type: input.type,
      channel: input.channel ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
      createdBy: input.createdBy ?? null,
    });
  } catch (error) {
    console.error("[carts] erro ao registar evento do carrinho:", error);
  }
}

/** Versão em lote — usada pela importação, que grava um evento por pedido. */
export async function recordCartEvents(inputs: RecordCartEventInput[]): Promise<void> {
  if (!isDatabaseConfigured() || inputs.length === 0) return;

  try {
    const db = getDb();
    await db.insert(cartEvents).values(
      inputs.map((input) => ({
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        type: input.type,
        channel: input.channel ?? null,
        message: input.message ?? null,
        metadata: input.metadata ?? {},
        createdBy: input.createdBy ?? null,
      })),
    );
  } catch (error) {
    console.error("[carts] erro ao registar eventos do carrinho:", error);
  }
}
