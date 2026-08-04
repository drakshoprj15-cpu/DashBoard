import { getDb, isDatabaseConfigured } from "@/database/client";
import { auditLogs } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface RecordAuditLogInput {
  /** Formato "entidade.evento", ex.: "product.created", "checkout.deleted". */
  action: string;
  entityType: string;
  entityId?: string;
  /** Contexto da mudança — nunca dados sensíveis (senha, token, cartão). */
  changes?: Record<string, unknown>;
}

/**
 * Registra uma ação administrativa no livro de auditoria.
 *
 * Nunca pode quebrar a ação que a chamou: uma falha aqui é só logada no
 * console, o mesmo princípio já usado nos efeitos pós-pagamento do webhook
 * do Broski. `actorId` fica sempre nulo — nenhuma action do painel resolve
 * a sessão do utilizador hoje, então não há "quem" real para registar ainda,
 * só o "quê" e o "quando".
 */
export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    await db.insert(auditLogs).values({
      workspaceId,
      actorId: null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      changes: input.changes ?? {},
    });
  } catch (error) {
    console.error("[audit] erro ao registar log:", error);
  }
}
