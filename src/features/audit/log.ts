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
  /** Workspace já validado pelo chamador. Evita atribuir logs multi-tenant ao workspace padrão. */
  workspaceId?: string;
  /** Utilizador autenticado quando a feature já resolveu a sessão. */
  actorId?: string;
}

/**
 * Registra uma ação administrativa no livro de auditoria.
 *
 * Nunca pode quebrar a ação que a chamou: uma falha aqui é só logada no
 * console, o mesmo princípio já usado nos efeitos pós-pagamento do webhook
 * do Broski. Features que já resolveram sessão/workspace podem informá-los;
 * as rotas legadas continuam usando o workspace padrão e ator nulo.
 */
export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    const db = getDb();
    const workspaceId =
      input.workspaceId ?? (await getOrCreateDefaultWorkspace());

    await db.insert(auditLogs).values({
      workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      changes: input.changes ?? {},
    });
  } catch (error) {
    console.error("[audit] erro ao registar log:", error);
  }
}
