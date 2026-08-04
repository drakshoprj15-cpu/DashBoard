import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/database/client";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { recordAuditLog } from "@/features/audit/log";
import {
  MAX_IMPORT_BATCH,
  importCartRows,
} from "@/features/carts/import/service";
import { validateRows } from "@/features/carts/import/validate";
import type { RawRow } from "@/features/carts/import/parse";

export const dynamic = "force-dynamic";

/**
 * As linhas chegam já parseadas pelo navegador (ver `import/parse.ts`), mas
 * são **revalidadas** aqui: o cliente pode enviar qualquer coisa, e é esta
 * revalidação que garante, entre outras coisas, que nenhuma linha entre como
 * pedido pago — receita só existe com confirmação do gateway.
 */
const rowSchema = z
  .object({
    _line: z.number().int().min(1).max(100_000),
    nome: z.string().max(300).optional(),
    email: z.string().max(300).optional(),
    telefone: z.string().max(60).optional(),
    cpf: z.string().max(60).optional(),
    produto: z.string().max(300).optional(),
    quantidade: z.string().max(20).optional(),
    valor: z.string().max(40).optional(),
    status: z.string().max(60).optional(),
    checkout_url: z.string().max(2000).optional(),
    data_criacao: z.string().max(60).optional(),
    data_atualizacao: z.string().max(60).optional(),
    origem: z.string().max(120).optional(),
    utm_source: z.string().max(120).optional(),
    utm_campaign: z.string().max(120).optional(),
    utm_medium: z.string().max(120).optional(),
    observacao: z.string().max(1000).optional(),
  })
  .strip();

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_IMPORT_BATCH),
  currency: z.enum(["EUR", "BRL", "USD"]).default("EUR"),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: `Envie no máximo ${MAX_IMPORT_BATCH} linhas por requisição.`,
      },
      { status: 400 },
    );
  }

  const { valid, invalid, warnings } = validateRows(
    parsed.data.rows as RawRow[],
    parsed.data.currency,
  );

  if (valid.length === 0) {
    return NextResponse.json(
      {
        imported: 0,
        duplicated: 0,
        failed: invalid.length,
        errors: invalid.map((row) => ({
          line: row.line,
          message: row.errors.join(" "),
        })),
        warnings,
      },
      { status: 422 },
    );
  }

  const workspaceId = await getOrCreateDefaultWorkspace();
  const outcome = await importCartRows(workspaceId, valid, session.user.id);

  await recordAuditLog({
    action: "cart.imported",
    entityType: "order",
    changes: {
      batchId: outcome.batchId,
      imported: outcome.imported,
      duplicated: outcome.duplicated,
      failed: outcome.failed + invalid.length,
    },
  });

  return NextResponse.json({
    ...outcome,
    failed: outcome.failed + invalid.length,
    errors: [
      ...outcome.errors,
      ...invalid.map((row) => ({
        line: row.line,
        message: row.errors.join(" "),
      })),
    ],
    warnings,
  });
}
