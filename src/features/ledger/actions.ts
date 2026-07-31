"use server";

import { revalidatePath } from "next/cache";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { ledgerEntries } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { recordAuditLog } from "@/features/audit/log";
import { createManualLedgerEntrySchema } from "@/validations/ledger";

export interface LedgerActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Lançamento manual de entrada/saída. `direction` nunca vem do formulário —
 * é sempre derivada do `type`, para o valor nunca poder ser gravado com a
 * direção errada.
 */
export async function createManualLedgerEntryAction(
  _prev: LedgerActionResult | null,
  formData: FormData,
): Promise<LedgerActionResult> {
  const parsed = createManualLedgerEntrySchema.safeParse({
    type: formData.get("type"),
    description: formData.get("description"),
    category: formData.get("category") || undefined,
    amountCents: formData.get("amount")
      ? Math.round(Number(formData.get("amount")) * 100)
      : undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const { type, description, category, amountCents } = parsed.data;

    const [created] = await db
      .insert(ledgerEntries)
      .values({
        workspaceId,
        type,
        direction: type === "manual_in" ? "in" : "out",
        description,
        category: category || null,
        amountCents,
        status: "confirmed",
      })
      .returning({ id: ledgerEntries.id });

    await recordAuditLog({
      action: "ledger.manual_entry_created",
      entityType: "ledger_entry",
      entityId: created.id,
      changes: { type, description, category: category || undefined, amountCents },
    });

    revalidatePath("/financeiro/entradas-saidas");
    return { ok: true, message: "Lançamento registado." };
  } catch (error) {
    console.error("[ledger] erro ao criar lançamento manual:", error);
    return { ok: false, error: "Não foi possível registar o lançamento." };
  }
}
