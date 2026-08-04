import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured, type Database } from "@/database/client";
import { customers, orderItems, orders } from "@/database/schema";
import { recordCartEvents } from "@/features/carts/events";
import { IMPORT_ORIGIN } from "@/features/carts/queries";
import {
  ORDER_STATUS_BY_IMPORT_STATUS,
  buildDedupeKey,
  type ValidCartImportRow,
} from "@/features/carts/import/validate";

/** Máximo de linhas aceites por requisição — mantém a função serverless leve. */
export const MAX_IMPORT_BATCH = 1_000;

export interface ImportOutcome {
  imported: number;
  duplicated: number;
  failed: number;
  batchId: string;
  errors: { line: number; message: string }[];
}

/**
 * E-mail sintético para linhas sem e-mail. `customers.email` é NOT NULL e tem
 * índice único por workspace, então cada linha anónima precisa de uma chave
 * própria e estável — derivada do telefone, ou do produto quando nem isso há.
 * O domínio `.invalid` é reservado pela RFC 2606: nunca resolve, logo nunca
 * há risco de enviar e-mail para um endereço inventado.
 */
function syntheticEmail(row: ValidCartImportRow): string {
  const seed = (row.phone ?? row.name ?? row.productName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40);
  return `sem-email-${seed || "carrinho"}@importacao.invalid`;
}

function splitName(full: string | null): { firstName: string | null; lastName: string | null } {
  if (!full) return { firstName: null, lastName: null };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Referência legível dos pedidos importados. Prefixo `IMP-` separa-os à
 * vista dos pedidos reais do checkout (`VD-`), e o sufixo aleatório evita
 * colisão com o índice único `orders_ws_reference_idx`.
 */
function importReference(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `IMP-${suffix}`;
}

/**
 * Chaves de deduplicação já existentes no workspace, entre os pedidos que
 * vieram de importação. Só compara com importados: um pedido real do
 * checkout nunca deve ser silenciosamente "absorvido" por uma planilha.
 */
async function loadExistingKeys(db: Database, workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({
      orderId: orders.id,
      email: customers.email,
      phone: customers.phone,
      checkoutUrl: orders.checkoutUrl,
      productName: orderItems.productName,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.origin, IMPORT_ORIGIN)));

  const keys = new Set<string>();
  for (const row of rows) {
    if (!row.productName) continue;
    keys.add(
      buildDedupeKey({
        email: row.email?.includes("@importacao.invalid") ? null : (row.email ?? null),
        phone: row.phone ?? null,
        productName: row.productName,
        checkoutUrl: row.checkoutUrl ?? null,
      }),
    );
  }
  return keys;
}

/**
 * Grava as linhas validadas como carrinhos reais.
 *
 * Escreve em `orders` (a fonte da verdade da página) e nunca com status pago:
 * `ORDER_STATUS_BY_IMPORT_STATUS` só mapeia para estados em aberto, para que
 * uma planilha jamais produza faturamento no Dashboard ou no Financeiro.
 */
export async function importCartRows(
  workspaceId: string,
  rows: ValidCartImportRow[],
  actorId: string | null,
): Promise<ImportOutcome> {
  const batchId = crypto.randomUUID();
  const outcome: ImportOutcome = {
    imported: 0,
    duplicated: 0,
    failed: 0,
    batchId,
    errors: [],
  };

  if (!isDatabaseConfigured() || rows.length === 0) return outcome;

  const db = getDb();
  const existingKeys = await loadExistingKeys(db, workspaceId);

  // Clientes já existentes, resolvidos em lote — evita um SELECT por linha.
  const emails = Array.from(
    new Set(rows.map((row) => (row.email ?? syntheticEmail(row)).toLowerCase())),
  );
  const existingCustomers =
    emails.length > 0
      ? await db
          .select({ id: customers.id, email: customers.email })
          .from(customers)
          .where(and(eq(customers.workspaceId, workspaceId), inArray(customers.email, emails)))
      : [];
  const customerIdByEmail = new Map(existingCustomers.map((c) => [c.email.toLowerCase(), c.id]));

  const events: Parameters<typeof recordCartEvents>[0] = [];

  for (const row of rows) {
    if (existingKeys.has(row.dedupeKey)) {
      outcome.duplicated += 1;
      continue;
    }

    try {
      const email = (row.email ?? syntheticEmail(row)).toLowerCase();
      let customerId = customerIdByEmail.get(email);

      if (!customerId) {
        const { firstName, lastName } = splitName(row.name);
        const [created] = await db
          .insert(customers)
          .values({
            workspaceId,
            email,
            firstName,
            lastName,
            phone: row.phone,
            document: row.document,
            notes: row.notes,
          })
          .onConflictDoUpdate({
            target: [customers.workspaceId, customers.email],
            // Só preenche o que estiver em falta — a planilha não pode apagar
            // dados melhores que já existam no cliente.
            set: {
              firstName: sql`coalesce(${customers.firstName}, excluded.first_name)`,
              lastName: sql`coalesce(${customers.lastName}, excluded.last_name)`,
              phone: sql`coalesce(${customers.phone}, excluded.phone)`,
              document: sql`coalesce(${customers.document}, excluded.document)`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: customers.id });
        customerId = created.id;
        customerIdByEmail.set(email, customerId);
      }

      const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
      const updatedAt = row.updatedAt ? new Date(row.updatedAt) : createdAt;
      const totalCents = row.amountCents * row.quantity;

      const [order] = await db
        .insert(orders)
        .values({
          workspaceId,
          reference: importReference(),
          customerId,
          status: ORDER_STATUS_BY_IMPORT_STATUS[row.status] as (typeof orders.$inferInsert)["status"],
          currency: row.currency,
          subtotalCents: totalCents,
          totalCents,
          checkoutUrl: row.checkoutUrl,
          origin: IMPORT_ORIGIN,
          importBatchId: batchId,
          internalNotes: row.notes,
          utm: {
            ...(row.utmSource ? { utm_source: row.utmSource } : {}),
            ...(row.utmCampaign ? { utm_campaign: row.utmCampaign } : {}),
            ...(row.utmMedium ? { utm_medium: row.utmMedium } : {}),
            ...(row.origin ? { origem: row.origin } : {}),
          },
          createdAt,
          updatedAt,
        })
        .returning({ id: orders.id });

      await db.insert(orderItems).values({
        workspaceId,
        orderId: order.id,
        productName: row.productName,
        quantity: row.quantity,
        unitPriceCents: row.amountCents,
        totalCents,
        currency: row.currency,
      });

      events.push({
        workspaceId,
        orderId: order.id,
        type: "imported",
        message: `Importado da linha ${row.line} da planilha.`,
        metadata: { batchId, line: row.line, status: row.status },
        createdBy: actorId,
      });

      existingKeys.add(row.dedupeKey);
      outcome.imported += 1;
    } catch (error) {
      outcome.failed += 1;
      // A mensagem do driver pode conter o valor que colidiu — não repassar.
      console.error("[carts:import] falha ao importar linha", row.line, error);
      outcome.errors.push({
        line: row.line,
        message: "Não foi possível gravar esta linha.",
      });
    }
  }

  await recordCartEvents(events);

  return outcome;
}
