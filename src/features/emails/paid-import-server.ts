import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/database/client";
import { customerActivities, customers } from "@/database/schema";
import { recordAuditLog } from "@/features/audit/log";
import {
  CUSTOMER_IMPORT_STATUS_TAGS,
  mergeCustomerImportTags,
  normalizeDocument,
  normalizeImportedProductName,
  normalizePhone,
} from "@/features/customers/customer-utils";
import type { CustomerAccessContext } from "@/features/customers/access";
import {
  paidImportAmountCents,
  splitPaidImportName,
  type PaidImportCandidate,
  type PaidImportLocalAnalysis,
} from "@/features/emails/paid-import";

const QUERY_BATCH_SIZE = 500;
const WRITE_BATCH_SIZE = 200;
const SOURCE_TAG = "Milu";

type ExistingCustomer = {
  id: string;
  email: string;
  normalizedEmail: string | null;
  emailStatus: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  document: string | null;
  importedProductName: string | null;
  source: string;
  firstSource: string | null;
  tags: unknown;
  marketingOptOut: boolean;
  isBlocked: boolean;
  unsubscribedAt: Date | null;
  firstPurchaseAt: Date | null;
  lastPurchaseAt: Date | null;
  deletedAt: Date | null;
};

export interface PaidImportServerAnalysis extends Omit<
  PaidImportLocalAnalysis,
  "contacts"
> {
  existingContacts: number;
  newContacts: number;
  finalToImport: number;
}

export interface PaidImportResult {
  importId: string;
  totalAnalyzed: number;
  paidFound: number;
  newContacts: number;
  existingContacts: number;
  updatedContacts: number;
  invalidContacts: number;
  ignoredContacts: number;
  duplicateRecords: number;
  errors: Array<{ line: number; message: string }>;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function existingCustomers(
  workspaceId: string,
  emails: string[],
): Promise<Map<string, ExistingCustomer>> {
  if (emails.length === 0) return new Map();
  const db = getDb();
  const rows: ExistingCustomer[] = [];
  for (const emailChunk of chunks(emails, QUERY_BATCH_SIZE)) {
    const selected = await db
      .select({
        id: customers.id,
        email: customers.email,
        normalizedEmail: customers.normalizedEmail,
        emailStatus: customers.emailStatus,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        normalizedPhone: customers.normalizedPhone,
        document: customers.document,
        importedProductName: customers.importedProductName,
        source: customers.source,
        firstSource: customers.firstSource,
        tags: customers.tags,
        marketingOptOut: customers.marketingOptOut,
        isBlocked: customers.isBlocked,
        unsubscribedAt: customers.unsubscribedAt,
        firstPurchaseAt: customers.firstPurchaseAt,
        lastPurchaseAt: customers.lastPurchaseAt,
        deletedAt: customers.deletedAt,
      })
      .from(customers)
      .where(
        and(
          eq(customers.workspaceId, workspaceId),
          or(
            inArray(customers.normalizedEmail, emailChunk),
            inArray(sql<string>`lower(trim(${customers.email}))`, emailChunk),
          ),
        ),
      );
    rows.push(...selected);
  }
  return new Map(
    rows.map((row) => [
      row.normalizedEmail ?? row.email.trim().toLowerCase(),
      row,
    ]),
  );
}

function normalizedSource(value: string | null): string {
  const normalized = (value || "milluni_csv")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return normalized || "milluni_csv";
}

function normalizedRecord(record: PaidImportCandidate, importedAt: Date) {
  const name = splitPaidImportName(record.name);
  const normalizedPhone = record.phone ? normalizePhone(record.phone) : null;
  const document = record.document ? normalizeDocument(record.document) : null;
  const product = record.product
    ? normalizeImportedProductName(record.product)
    : null;
  const purchasedAt = record.purchasedAt
    ? new Date(record.purchasedAt)
    : importedAt;
  const source = normalizedSource(record.origin);
  return {
    ...record,
    ...name,
    phone: normalizedPhone ? record.phone : null,
    normalizedPhone,
    document,
    product,
    purchasedAt,
    source,
    tags: mergeCustomerImportTags([], [SOURCE_TAG], "paid"),
  };
}

function hasTag(tags: unknown, tag: string): boolean {
  return Array.isArray(tags) && tags.includes(tag);
}

function willUpdate(
  current: ExistingCustomer,
  record: ReturnType<typeof normalizedRecord>,
): boolean {
  return Boolean(
    current.normalizedEmail !== record.email ||
    current.emailStatus !== "valid" ||
    (!current.firstName && record.firstName) ||
    (!current.lastName && record.lastName) ||
    (!current.phone && record.phone) ||
    (!current.normalizedPhone && record.normalizedPhone) ||
    (!current.document && record.document) ||
    (!current.importedProductName && record.product) ||
    (current.source === "unknown" && record.source) ||
    !hasTag(current.tags, SOURCE_TAG) ||
    !hasTag(current.tags, CUSTOMER_IMPORT_STATUS_TAGS.paid) ||
    !current.firstPurchaseAt ||
    !current.lastPurchaseAt ||
    current.lastPurchaseAt < record.purchasedAt,
  );
}

export async function analyzePaidImportForWorkspace(
  workspaceId: string,
  local: PaidImportLocalAnalysis,
): Promise<PaidImportServerAnalysis> {
  const existing = await existingCustomers(
    workspaceId,
    local.contacts.map((contact) => contact.email),
  );
  const { contacts: _contacts, ...summary } = local;
  return {
    ...summary,
    existingContacts: existing.size,
    newContacts: local.contacts.length - existing.size,
    finalToImport: local.contacts.length,
  };
}

export async function importPaidContacts(input: {
  access: CustomerAccessContext;
  local: PaidImportLocalAnalysis;
  fileName: string;
}): Promise<PaidImportResult> {
  const { access, local } = input;
  const importId = crypto.randomUUID();
  const importedAt = new Date();
  const records = local.contacts.map((record) =>
    normalizedRecord(record, importedAt),
  );
  const before = await existingCustomers(
    access.workspaceId,
    records.map((record) => record.email),
  );
  const newRecords = records.filter((record) => !before.has(record.email));
  const changedRecords = records.filter((record) => {
    const current = before.get(record.email);
    return current ? willUpdate(current, record) : false;
  });
  const db = getDb();
  const insertedEmails = new Set<string>();
  const customerIds = new Map(
    Array.from(before.entries(), ([email, customer]) => [email, customer.id]),
  );

  await db.transaction(async (tx) => {
    for (const batch of chunks(newRecords, WRITE_BATCH_SIZE)) {
      const inserted = await tx
        .insert(customers)
        .values(
          batch.map((record) => ({
            id: crypto.randomUUID(),
            workspaceId: access.workspaceId,
            email: record.email,
            normalizedEmail: record.email,
            emailStatus: "valid",
            firstName: record.firstName,
            lastName: record.lastName,
            phone: record.phone,
            normalizedPhone: record.normalizedPhone,
            document: record.document,
            source: record.source,
            firstSource: record.source,
            importedProductName: record.product,
            tags: record.tags,
            acceptsEmail: true,
            marketingOptOut: false,
            firstSeenAt: record.purchasedAt,
            lastActivityAt: importedAt,
            firstPurchaseAt: record.purchasedAt,
            lastPurchaseAt: record.purchasedAt,
          })),
        )
        .onConflictDoNothing()
        .returning({
          id: customers.id,
          normalizedEmail: customers.normalizedEmail,
        });
      for (const row of inserted) {
        if (row.normalizedEmail) {
          insertedEmails.add(row.normalizedEmail);
          customerIds.set(row.normalizedEmail, row.id);
        }
      }
    }

    for (const batch of chunks(changedRecords, WRITE_BATCH_SIZE)) {
      const payload = batch.map((record) => {
        const current = before.get(record.email)!;
        return {
          id: current.id,
          email: record.email,
          first_name: record.firstName,
          last_name: record.lastName,
          phone: record.phone,
          normalized_phone: record.normalizedPhone,
          document: record.document,
          product: record.product,
          source: record.source,
          tags: record.tags,
          purchased_at: record.purchasedAt.toISOString(),
        };
      });
      await tx.execute(sql`
        update customers as current
        set
          normalized_email = incoming.email,
          email_status = 'valid',
          first_name = coalesce(nullif(current.first_name, ''), incoming.first_name),
          last_name = coalesce(nullif(current.last_name, ''), incoming.last_name),
          phone = coalesce(nullif(current.phone, ''), incoming.phone),
          normalized_phone = coalesce(current.normalized_phone, incoming.normalized_phone),
          document = coalesce(nullif(current.document, ''), incoming.document),
          imported_product_name = coalesce(nullif(current.imported_product_name, ''), incoming.product),
          source = case when current.source = 'unknown' then incoming.source else current.source end,
          first_source = coalesce(current.first_source, incoming.source),
          tags = (
            select coalesce(jsonb_agg(tag.value), '[]'::jsonb)
            from (
              select distinct value
              from jsonb_array_elements(coalesce(current.tags, '[]'::jsonb) || coalesce(incoming.tags, '[]'::jsonb))
            ) as tag
          ),
          first_purchase_at = case
            when current.first_purchase_at is null then incoming.purchased_at
            else least(current.first_purchase_at, incoming.purchased_at)
          end,
          last_purchase_at = case
            when current.last_purchase_at is null then incoming.purchased_at
            else greatest(current.last_purchase_at, incoming.purchased_at)
          end,
          last_activity_at = greatest(current.last_activity_at, incoming.purchased_at),
          updated_at = ${importedAt}
        from jsonb_to_recordset(${JSON.stringify(payload)}::text::jsonb) as incoming(
          id uuid,
          email text,
          first_name text,
          last_name text,
          phone text,
          normalized_phone text,
          document text,
          product text,
          source text,
          tags jsonb,
          purchased_at timestamptz
        )
        where current.id = incoming.id
          and current.workspace_id = ${access.workspaceId}::uuid
      `);
    }

    const updatedEmails = new Set(changedRecords.map((record) => record.email));
    const activityRows = records.flatMap((record) => {
      const customerId = customerIds.get(record.email);
      if (!customerId) return [];
      const inserted = insertedEmails.has(record.email);
      const updated = updatedEmails.has(record.email);
      return [
        {
          workspaceId: access.workspaceId,
          customerId,
          type: inserted
            ? "customer_imported"
            : updated
              ? "payment_approved"
              : "customer_import_reviewed",
          source: "milluni_csv",
          createdBy: access.userId,
          metadata: {
            importId,
            fileName: input.fileName.slice(0, 255),
            line: record.line,
            paymentEvidence: "mapped_approved_status",
            paymentStatus: record.status,
            purchasedAt: record.purchasedAt,
            productName: record.product,
            amount: record.amount,
            amountCents: paidImportAmountCents(record.amount),
            origin: record.origin ?? "Milu CSV",
            additionalData: record.additionalData,
          },
        },
      ];
    });
    for (const batch of chunks(activityRows, WRITE_BATCH_SIZE)) {
      await tx.insert(customerActivities).values(batch);
    }
  });

  const inserted = insertedEmails.size;
  const updated = changedRecords.length;
  const existing = records.length - inserted - updated;
  const result: PaidImportResult = {
    importId,
    totalAnalyzed: local.totalRecords,
    paidFound: local.paidRecords,
    newContacts: inserted,
    existingContacts: Math.max(0, existing),
    updatedContacts: updated,
    invalidContacts: local.errors.length,
    ignoredContacts: local.nonPayingRecords + local.duplicateRecords,
    duplicateRecords: local.duplicateRecords,
    errors: local.errors,
  };

  await recordAuditLog({
    action: "email_contacts.imported",
    entityType: "customer_import",
    entityId: importId,
    workspaceId: access.workspaceId,
    actorId: access.userId,
    changes: {
      fileName: input.fileName.slice(0, 255),
      totalAnalyzed: result.totalAnalyzed,
      paidFound: result.paidFound,
      newContacts: result.newContacts,
      existingContacts: result.existingContacts,
      updatedContacts: result.updatedContacts,
      invalidContacts: result.invalidContacts,
      ignoredContacts: result.ignoredContacts,
    },
  });
  return result;
}
