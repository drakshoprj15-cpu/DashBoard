import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customers,
  emailSuppressions,
  orderItems,
  orders,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import { SEGMENTS, type SegmentKey } from "@/features/emails/types";

// Reexporta para quem já importava daqui — o conteúdo client-safe vive
// em `./types` (sem tocar no cliente do banco).
export {
  SEGMENTS,
  type SegmentKey,
  type SegmentDefinition,
} from "@/features/emails/types";

const STATUS_BY_SEGMENT: Record<string, string[]> = {
  paid: ["paid", "preparing", "shipped", "delivered"],
  pending: ["created", "awaiting_payment", "processing"],
  refused: ["refused", "expired", "cancelled"],
};

export interface Recipient {
  id: string;
  email: string;
  name: string;
  orderCount: number;
  totalSpentCents: number;
  orderId: string | null;
  orderReference: string | null;
  productName: string | null;
  checkoutUrl: string | null;
  orderTotalCents: number | null;
  currency: string | null;
}

type RecipientWithoutContext = Omit<
  Recipient,
  | "orderId"
  | "orderReference"
  | "productName"
  | "checkoutUrl"
  | "orderTotalCents"
  | "currency"
> & { fallbackProductName?: string | null };

async function addOrderContext(
  recipients: RecipientWithoutContext[],
  statuses?: string[],
): Promise<Recipient[]> {
  if (recipients.length === 0) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const rows = await db
    .select({
      customerId: orders.customerId,
      orderId: orders.id,
      reference: orders.reference,
      productName: orderItems.productName,
      checkoutUrl: orders.checkoutUrl,
      totalCents: orders.totalCents,
      currency: orders.currency,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        inArray(
          orders.customerId,
          recipients.map((recipient) => recipient.id),
        ),
        statuses ? inArray(orders.status, statuses as never) : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orderItems.createdAt));

  const latestByCustomer = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.customerId && !latestByCustomer.has(row.customerId)) {
      latestByCustomer.set(row.customerId, row);
    }
  }

  return recipients.map((recipient) => {
    const context = latestByCustomer.get(recipient.id);
    const { fallbackProductName, ...baseRecipient } = recipient;
    return {
      ...baseRecipient,
      orderId: context?.orderId ?? null,
      orderReference: context?.reference ?? null,
      productName: context?.productName ?? fallbackProductName ?? null,
      checkoutUrl: context?.checkoutUrl ?? null,
      orderTotalCents: context ? Number(context.totalCents) : null,
      currency: context?.currency ?? null,
    };
  });
}

/**
 * Destinatários de um segmento.
 *
 * Sempre exclui quem pediu para não receber comunicações (`marketingOptOut`)
 * e quem está na lista de supressão — exigência do RGPD e das regras
 * antispam.
 */
export async function getSegmentRecipients(
  segment: SegmentKey,
  includeOrderContext = true,
): Promise<Recipient[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const suppressed = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.workspaceId, workspaceId));
  const blocked = new Set(suppressed.map((s) => s.email.toLowerCase()));

  const statuses = STATUS_BY_SEGMENT[segment];
  // A tag de importação foi gravada em praticamente toda a base, então não
  // distingue quem pagou. `first_purchase_at` é o sinal confiável de compra
  // anterior nos registos importados.
  const audienceCondition = statuses
    ? segment === "paid"
      ? or(
          inArray(orders.status, statuses as never),
          isNotNull(customers.firstPurchaseAt),
        )
      : inArray(orders.status, statuses as never)
    : undefined;

  const rows = await db
    .select({
      id: customers.id,
      email: customers.email,
      firstName: customers.firstName,
      lastName: customers.lastName,
      importedProductName: customers.importedProductName,
      orderCount: sql<number>`count(${orders.id})::int`,
      totalSpentCents: sql<number>`coalesce(sum(case when ${orders.status} in ('paid','preparing','shipped','delivered') then ${orders.totalCents} else 0 end), 0)::int`,
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(customers.workspaceId, workspaceId),
        isNull(customers.deletedAt),
        eq(customers.marketingOptOut, false),
        eq(customers.isBlocked, false),
        audienceCondition,
      ),
    )
    .groupBy(
      customers.id,
      customers.email,
      customers.firstName,
      customers.lastName,
      customers.importedProductName,
    );

  const filtered =
    segment === "no_orders" ? rows.filter((r) => r.orderCount === 0) : rows;

  const recipients = filtered
    .filter((r) => !blocked.has(r.email.toLowerCase()))
    .map((r) => ({
      id: r.id,
      email: r.email,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
      orderCount: r.orderCount,
      totalSpentCents: r.totalSpentCents,
      fallbackProductName: r.importedProductName,
    }));

  return includeOrderContext
    ? addOrderContext(recipients, statuses)
    : recipients.map((recipient) => ({
        ...recipient,
        orderId: null,
        orderReference: null,
        productName: null,
        checkoutUrl: null,
        orderTotalCents: null,
        currency: null,
      }));
}

/** Busca leve para o seletor manual da aba Emails. */
export async function searchEmailRecipients(
  query: string,
  limit = 20,
): Promise<Recipient[]> {
  if (!isDatabaseConfigured()) return [];

  const term = query.trim().slice(0, 120);
  if (term.length < 2) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const safeLimit = Math.min(Math.max(limit, 1), 30);
  const pattern = `%${term}%`;
  const [suppressed, rows] = await Promise.all([
    db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(eq(emailSuppressions.workspaceId, workspaceId)),
    db
      .select({
        id: customers.id,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        importedProductName: customers.importedProductName,
      })
      .from(customers)
      .where(
        and(
          eq(customers.workspaceId, workspaceId),
          isNull(customers.deletedAt),
          eq(customers.marketingOptOut, false),
          eq(customers.isBlocked, false),
          or(
            ilike(customers.email, pattern),
            ilike(customers.firstName, pattern),
            ilike(customers.lastName, pattern),
            sql`concat_ws(' ', ${customers.firstName}, ${customers.lastName}) ilike ${pattern}`,
          ),
        ),
      )
      .orderBy(desc(customers.lastActivityAt))
      .limit(safeLimit),
  ]);

  const suppressedEmails = new Set(
    suppressed.map((row) => row.email.toLowerCase()),
  );
  const recipients: RecipientWithoutContext[] = rows
    .filter((row) => !suppressedEmails.has(row.email.toLowerCase()))
    .map((row) => ({
      id: row.id,
      email: row.email,
      name:
        [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
      orderCount: 0,
      totalSpentCents: 0,
      fallbackProductName: row.importedProductName,
    }));

  return addOrderContext(recipients);
}

/** Contagem de cada segmento, para exibir no painel. */
export async function getSegmentCounts(): Promise<Record<SegmentKey, number>> {
  const entries = await Promise.all(
    SEGMENTS.map(async (s) => {
      const list = await getSegmentRecipients(s.key, false);
      return [s.key, list.length] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<SegmentKey, number>;
}

export interface CustomRecipientsResult {
  recipients: Recipient[];
  /** Quantos ids foram passados originalmente (antes de qualquer exclusão). */
  totalSelected: number;
  /** Optaram por não receber comunicações ou estão bloqueados. */
  excludedNoConsent: number;
  /** Estão na lista de supressão (descadastro/bounce/reclamação). */
  excludedSuppressed: number;
  /** Ids que não correspondem a nenhum cliente deste workspace. */
  notFoundCount: number;
}

/**
 * Destinatários escolhidos manualmente (seleção de linhas em Carrinhos),
 * pelo id do cliente. Aplica as mesmas regras de exclusão dos segmentos
 * fixos e nunca duplica por e-mail, mesmo que o mesmo cliente apareça mais
 * de uma vez na seleção original.
 */
export async function getCustomRecipients(
  customerIds: string[],
): Promise<CustomRecipientsResult> {
  const totalSelected = customerIds.length;

  if (!isDatabaseConfigured() || totalSelected === 0) {
    return {
      recipients: [],
      totalSelected,
      excludedNoConsent: 0,
      excludedSuppressed: 0,
      notFoundCount: totalSelected,
    };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const suppressed = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.workspaceId, workspaceId));
  const suppressedEmails = new Set(
    suppressed.map((s) => s.email.toLowerCase()),
  );

  const rows = await db
    .select({
      id: customers.id,
      email: customers.email,
      firstName: customers.firstName,
      lastName: customers.lastName,
      importedProductName: customers.importedProductName,
      marketingOptOut: customers.marketingOptOut,
      isBlocked: customers.isBlocked,
      orderCount: sql<number>`count(${orders.id})::int`,
      totalSpentCents: sql<number>`coalesce(sum(case when ${orders.status} in ('paid','preparing','shipped','delivered') then ${orders.totalCents} else 0 end), 0)::int`,
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(customers.workspaceId, workspaceId),
        isNull(customers.deletedAt),
        inArray(customers.id, customerIds),
      ),
    )
    .groupBy(
      customers.id,
      customers.email,
      customers.firstName,
      customers.lastName,
      customers.importedProductName,
      customers.marketingOptOut,
      customers.isBlocked,
    );

  const foundIds = new Set(rows.map((r) => r.id));
  const notFoundCount = customerIds.filter((id) => !foundIds.has(id)).length;

  let excludedNoConsent = 0;
  let excludedSuppressed = 0;
  const seenEmails = new Set<string>();
  const recipients: RecipientWithoutContext[] = [];

  for (const r of rows) {
    if (r.marketingOptOut || r.isBlocked) {
      excludedNoConsent += 1;
      continue;
    }
    if (suppressedEmails.has(r.email.toLowerCase())) {
      excludedSuppressed += 1;
      continue;
    }
    if (seenEmails.has(r.email.toLowerCase())) continue;
    seenEmails.add(r.email.toLowerCase());

    recipients.push({
      id: r.id,
      email: r.email,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
      orderCount: r.orderCount,
      totalSpentCents: r.totalSpentCents,
      fallbackProductName: r.importedProductName,
    });
  }

  return {
    recipients: await addOrderContext(recipients),
    totalSelected,
    excludedNoConsent,
    excludedSuppressed,
    notFoundCount,
  };
}
