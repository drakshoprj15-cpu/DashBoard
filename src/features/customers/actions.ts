"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customerActivities,
  customerAddresses,
  customerNotes,
  customerSegments,
  customerTagAssignments,
  customerTags,
  customers,
  emailSuppressions,
} from "@/database/schema";
import { recordAuditLog } from "@/features/audit/log";
import { requireCustomerPermission } from "@/features/customers/access";
import {
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
  resolveDuplicateCandidate,
} from "@/features/customers/customer-utils";
import type { CustomerMutationResult } from "@/features/customers/types";

const customerSchema = z.object({
  firstName: z.string().trim().min(1, "Informe o nome.").max(100),
  lastName: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().email("Informe um e-mail válido.").max(254),
  phone: z.string().trim().max(40).optional().default(""),
  document: z.string().trim().max(30).optional().default(""),
  country: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(100).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  postalCode: z.string().trim().max(30).optional().default(""),
  street: z.string().trim().max(180).optional().default(""),
  number: z.string().trim().max(40).optional().default(""),
  complement: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(4000).optional().default(""),
  acceptsEmail: z.boolean().default(false),
  acceptsWhatsapp: z.boolean().default(false),
  forceCreate: z.boolean().default(false),
});

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export async function createCustomerAction(
  formData: FormData,
): Promise<CustomerMutationResult> {
  if (!isDatabaseConfigured())
    return { ok: false, error: "Banco não conectado." };
  const access = await requireCustomerPermission("create");
  const parsed = customerSchema.safeParse({
    firstName: value(formData, "firstName"),
    lastName: value(formData, "lastName"),
    email: value(formData, "email"),
    phone: value(formData, "phone"),
    document: value(formData, "document"),
    country: value(formData, "country"),
    state: value(formData, "state"),
    city: value(formData, "city"),
    postalCode: value(formData, "postalCode"),
    street: value(formData, "street"),
    number: value(formData, "number"),
    complement: value(formData, "complement"),
    note: value(formData, "note"),
    acceptsEmail: formData.get("acceptsEmail") === "true",
    acceptsWhatsapp: formData.get("acceptsWhatsapp") === "true",
    forceCreate: formData.get("forceCreate") === "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const input = parsed.data;
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;
  const normalizedDocument = input.document
    ? normalizeDocument(input.document)
    : null;
  if (!normalizedEmail) return { ok: false, error: "E-mail inválido." };
  if (input.phone && !normalizedPhone)
    return {
      ok: false,
      error: "Telefone inválido. Inclua o código do país quando possível.",
    };
  if (input.document && !normalizedDocument)
    return { ok: false, error: "CPF/NIF inválido." };

  const db = getDb();
  const duplicateConditions = [eq(customers.normalizedEmail, normalizedEmail)];
  if (normalizedPhone)
    duplicateConditions.push(eq(customers.normalizedPhone, normalizedPhone));
  if (normalizedDocument)
    duplicateConditions.push(eq(customers.document, normalizedDocument));

  const duplicateCandidates = await db
    .select({
      id: customers.id,
      normalizedEmail: customers.normalizedEmail,
      normalizedPhone: customers.normalizedPhone,
      normalizedDocument: customers.document,
    })
    .from(customers)
    .where(
      and(
        eq(customers.workspaceId, access.workspaceId),
        isNull(customers.deletedAt),
        or(...duplicateConditions),
      ),
    )
    .limit(20);
  const duplicate = resolveDuplicateCandidate(duplicateCandidates, {
    normalizedEmail,
    normalizedPhone,
    normalizedDocument,
  });

  if (duplicate && !input.forceCreate) {
    return {
      ok: false,
      duplicateId: duplicate.id,
      error: "Encontramos um cliente com dados semelhantes.",
    };
  }

  const now = new Date();
  const customerId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(customers).values({
      id: customerId,
      workspaceId: access.workspaceId,
      firstName: input.firstName,
      lastName: input.lastName || null,
      email: normalizedEmail,
      normalizedEmail,
      emailStatus: "valid",
      phone: input.phone || null,
      normalizedPhone,
      document: normalizedDocument,
      country: input.country || null,
      source: "manual",
      firstSource: "manual",
      acceptsEmail: input.acceptsEmail,
      acceptsWhatsapp: input.acceptsWhatsapp,
      marketingOptOut: !input.acceptsEmail,
      firstSeenAt: now,
      lastActivityAt: now,
    });

    if (
      input.country ||
      input.state ||
      input.city ||
      input.postalCode ||
      input.street
    ) {
      await tx.insert(customerAddresses).values({
        workspaceId: access.workspaceId,
        customerId,
        label: "Principal",
        country: input.country || "Não informado",
        state: input.state || null,
        city: input.city || null,
        postalCode: input.postalCode || null,
        street: input.street || null,
        number: input.number || null,
        complement: input.complement || null,
        isDefault: true,
      });
    }

    await tx.insert(customerActivities).values({
      workspaceId: access.workspaceId,
      customerId,
      type: "customer_created",
      source: "manual",
      createdBy: access.userId,
      metadata: {},
    });

    if (input.note) {
      await tx.insert(customerNotes).values({
        workspaceId: access.workspaceId,
        customerId,
        content: input.note,
        createdBy: access.userId,
      });
    }
  });

  await recordAuditLog({
    action: "customer.created",
    entityType: "customer",
    entityId: customerId,
    changes: { source: "manual" },
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  await recordAuditLog({
    action: "customer.note_added",
    entityType: "customer",
    entityId: customerId,
    changes: {},
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  revalidatePath("/clientes");
  return { ok: true, customerId, message: "Cliente adicionado com sucesso." };
}

export async function addCustomerNoteAction(
  customerId: string,
  content: string,
): Promise<CustomerMutationResult> {
  const access = await requireCustomerPermission("edit");
  const clean = content.trim();
  if (!clean || clean.length > 4000)
    return {
      ok: false,
      error: "A observação deve ter entre 1 e 4.000 caracteres.",
    };
  const db = getDb();
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.workspaceId, access.workspaceId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);
  if (!customer) return { ok: false, error: "Cliente não encontrado." };

  await db.transaction(async (tx) => {
    await tx.insert(customerNotes).values({
      workspaceId: access.workspaceId,
      customerId,
      content: clean,
      createdBy: access.userId,
    });
    await tx.insert(customerActivities).values({
      workspaceId: access.workspaceId,
      customerId,
      type: "note_added",
      source: "manual",
      createdBy: access.userId,
      metadata: {},
    });
    await tx
      .update(customers)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.workspaceId, access.workspaceId),
        ),
      );
  });
  revalidatePath("/clientes");
  return { ok: true, message: "Observação adicionada." };
}

export async function createCustomerSegmentAction(
  formData: FormData,
): Promise<CustomerMutationResult> {
  const access = await requireCustomerPermission("manage_segments");
  const name = value(formData, "name").trim();
  const description = value(formData, "description").trim();
  const type = value(formData, "type") === "static" ? "static" : "dynamic";
  const rulesValue = value(formData, "rules");
  const estimatedCount = Math.max(
    0,
    Number.parseInt(value(formData, "estimatedCount"), 10) || 0,
  );
  if (!name || name.length > 120)
    return { ok: false, error: "Informe um nome de até 120 caracteres." };
  let rules: Record<string, unknown> = {};
  try {
    rules = rulesValue
      ? (JSON.parse(rulesValue) as Record<string, unknown>)
      : {};
  } catch {
    return { ok: false, error: "As regras do segmento são inválidas." };
  }
  const db = getDb();
  const [segment] = await db
    .insert(customerSegments)
    .values({
      workspaceId: access.workspaceId,
      name,
      description: description || null,
      type,
      rules,
      estimatedCount: String(estimatedCount),
      createdBy: access.userId,
    })
    .onConflictDoNothing()
    .returning({ id: customerSegments.id });
  if (!segment)
    return { ok: false, error: "Já existe um segmento com este nome." };
  await recordAuditLog({
    action: "customer_segment.created",
    entityType: "customer_segment",
    entityId: segment.id,
    changes: { type },
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  revalidatePath("/clientes");
  return { ok: true, message: "Segmento criado." };
}

export async function applyCustomerTagAction(
  customerIds: string[],
  tagName: string,
): Promise<CustomerMutationResult> {
  const access = await requireCustomerPermission("manage_tags");
  const ids = Array.from(new Set(customerIds)).slice(0, 500);
  const cleanTag = tagName.trim().slice(0, 60);
  if (ids.length === 0 || !cleanTag)
    return { ok: false, error: "Selecione clientes e informe uma tag." };
  const db = getDb();
  const validCustomers = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.workspaceId, access.workspaceId),
        isNull(customers.deletedAt),
        inArray(customers.id, ids),
      ),
    );
  if (validCustomers.length === 0)
    return { ok: false, error: "Nenhum cliente válido selecionado." };

  await db.transaction(async (tx) => {
    const [existingTag] = await tx
      .select({ id: customerTags.id })
      .from(customerTags)
      .where(
        and(
          eq(customerTags.workspaceId, access.workspaceId),
          eq(customerTags.name, cleanTag),
        ),
      )
      .limit(1);
    const tagId =
      existingTag?.id ??
      (
        await tx
          .insert(customerTags)
          .values({ workspaceId: access.workspaceId, name: cleanTag })
          .returning({ id: customerTags.id })
      )[0].id;
    await tx
      .insert(customerTagAssignments)
      .values(
        validCustomers.map((customer) => ({
          workspaceId: access.workspaceId,
          customerId: customer.id,
          tagId,
          createdBy: access.userId,
        })),
      )
      .onConflictDoNothing();
  });
  await recordAuditLog({
    action: "customer.tag_added",
    entityType: "customer",
    changes: { count: validCustomers.length, tag: cleanTag },
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  revalidatePath("/clientes");
  return {
    ok: true,
    message: `Tag adicionada a ${validCustomers.length} contato(s).`,
  };
}

export async function removeCustomerTagAction(
  customerIds: string[],
  tagName: string,
): Promise<CustomerMutationResult> {
  const access = await requireCustomerPermission("manage_tags");
  const ids = Array.from(new Set(customerIds)).slice(0, 500);
  const cleanTag = tagName.trim().slice(0, 60);
  if (ids.length === 0 || !cleanTag)
    return { ok: false, error: "Selecione clientes e informe a tag." };

  const db = getDb();
  const [tag] = await db
    .select({ id: customerTags.id })
    .from(customerTags)
    .where(
      and(
        eq(customerTags.workspaceId, access.workspaceId),
        eq(customerTags.name, cleanTag),
      ),
    )
    .limit(1);
  if (!tag) return { ok: false, error: "Tag não encontrada." };

  const removed = await db
    .delete(customerTagAssignments)
    .where(
      and(
        eq(customerTagAssignments.workspaceId, access.workspaceId),
        eq(customerTagAssignments.tagId, tag.id),
        inArray(customerTagAssignments.customerId, ids),
      ),
    )
    .returning({ id: customerTagAssignments.id });

  await recordAuditLog({
    action: "customer.tag_removed",
    entityType: "customer",
    changes: { count: removed.length, tag: cleanTag },
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  revalidatePath("/clientes");
  return { ok: true, message: `Tag removida de ${removed.length} contato(s).` };
}

const updateCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    document: z.string().trim().max(30).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
    acceptsEmail: z.boolean().optional(),
    acceptsSms: z.boolean().optional(),
    acceptsWhatsapp: z.boolean().optional(),
  })
  .strict();

export async function updateCustomerAction(
  customerId: string,
  input: unknown,
): Promise<CustomerMutationResult> {
  const access = await requireCustomerPermission("edit");
  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Os dados enviados são inválidos." };
  if (Object.keys(parsed.data).length === 0)
    return { ok: false, error: "Nenhuma alteração foi informada." };

  const normalizedEmail = parsed.data.email
    ? normalizeEmail(parsed.data.email)
    : undefined;
  const normalizedPhone =
    parsed.data.phone === undefined
      ? undefined
      : parsed.data.phone
        ? normalizePhone(parsed.data.phone)
        : null;
  const normalizedDocument =
    parsed.data.document === undefined
      ? undefined
      : parsed.data.document
        ? normalizeDocument(parsed.data.document)
        : null;
  if (parsed.data.email && !normalizedEmail)
    return { ok: false, error: "E-mail inválido." };
  if (parsed.data.phone && !normalizedPhone)
    return { ok: false, error: "Telefone inválido." };
  if (parsed.data.document && !normalizedDocument)
    return { ok: false, error: "CPF/NIF inválido." };

  const db = getDb();
  const [owned] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.workspaceId, access.workspaceId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Cliente não encontrado." };

  const changedIdentities = [];
  if (normalizedEmail)
    changedIdentities.push(eq(customers.normalizedEmail, normalizedEmail));
  if (normalizedPhone)
    changedIdentities.push(eq(customers.normalizedPhone, normalizedPhone));
  if (normalizedDocument)
    changedIdentities.push(eq(customers.document, normalizedDocument));
  if (changedIdentities.length > 0) {
    const identityMatches = await db
      .select({
        id: customers.id,
        normalizedEmail: customers.normalizedEmail,
        normalizedPhone: customers.normalizedPhone,
        normalizedDocument: customers.document,
      })
      .from(customers)
      .where(
        and(
          eq(customers.workspaceId, access.workspaceId),
          isNull(customers.deletedAt),
          or(...changedIdentities),
        ),
      )
      .limit(20);
    const conflict = resolveDuplicateCandidate(
      identityMatches.filter((candidate) => candidate.id !== customerId),
      {
        normalizedEmail: normalizedEmail ?? null,
        normalizedPhone: normalizedPhone ?? null,
        normalizedDocument: normalizedDocument ?? null,
      },
    );
    if (conflict)
      return {
        ok: false,
        duplicateId: conflict.id,
        error: "Encontramos outro cliente com dados semelhantes.",
      };
  }

  await db
    .update(customers)
    .set({
      ...parsed.data,
      normalizedEmail,
      emailStatus: parsed.data.email ? "valid" : undefined,
      normalizedPhone,
      document: normalizedDocument,
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    })
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.workspaceId, access.workspaceId),
      ),
    );
  await recordAuditLog({
    action: "customer.updated",
    entityType: "customer",
    entityId: customerId,
    changes: { fields: Object.keys(parsed.data) },
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  revalidatePath("/clientes");
  return { ok: true, customerId, message: "Cliente atualizado." };
}

export async function anonymizeCustomersAction(
  customerIds: string[],
): Promise<CustomerMutationResult> {
  const access = await requireCustomerPermission("delete");
  const ids = Array.from(new Set(customerIds)).slice(0, 100);
  if (ids.length === 0)
    return { ok: false, error: "Nenhum cliente selecionado." };
  const db = getDb();
  const valid = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.workspaceId, access.workspaceId),
        inArray(customers.id, ids),
        isNull(customers.deletedAt),
      ),
    );
  const now = new Date();
  for (const customer of valid) {
    const token = crypto.randomUUID();
    await db
      .update(customers)
      .set({
        firstName: "Cliente",
        lastName: "anonimizado",
        email: `anonimizado+${token}@privacy.infinity.local`,
        normalizedEmail: `anonimizado+${token}@privacy.infinity.local`,
        emailStatus: "unavailable",
        phone: null,
        normalizedPhone: null,
        document: null,
        notes: null,
        tags: [],
        marketingOptOut: true,
        acceptsEmail: false,
        acceptsSms: false,
        acceptsWhatsapp: false,
        unsubscribedAt: now,
        deletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(customers.id, customer.id),
          eq(customers.workspaceId, access.workspaceId),
        ),
      );
  }
  await recordAuditLog({
    action: "customer.anonymized",
    entityType: "customer",
    changes: { count: valid.length },
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  revalidatePath("/clientes");
  return { ok: true, message: `${valid.length} cliente(s) anonimizado(s).` };
}

export async function toggleMarketingConsentAction(
  formData: FormData,
): Promise<void> {
  const id = value(formData, "id");
  const optOut = formData.get("optOut") === "true";
  if (!id || !isDatabaseConfigured()) return;
  const access = await requireCustomerPermission("edit");
  const db = getDb();
  const [customer] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(
      and(eq(customers.id, id), eq(customers.workspaceId, access.workspaceId)),
    )
    .limit(1);
  if (!customer) return;

  await db
    .update(customers)
    .set({
      marketingOptOut: optOut,
      acceptsEmail: !optOut,
      unsubscribedAt: optOut ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(customers.id, id), eq(customers.workspaceId, access.workspaceId)),
    );

  if (optOut) {
    await db
      .insert(emailSuppressions)
      .values({
        workspaceId: access.workspaceId,
        email: customer.email,
        reason: "manual",
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(emailSuppressions)
      .where(
        and(
          eq(emailSuppressions.workspaceId, access.workspaceId),
          eq(emailSuppressions.email, customer.email),
        ),
      );
  }

  await recordAuditLog({
    action: "customer.marketing_consent_updated",
    entityType: "customer",
    entityId: id,
    changes: { marketingOptOut: optOut },
    workspaceId: access.workspaceId,
    actorId: access.userId,
  });
  revalidatePath("/clientes");
  revalidatePath("/emails");
}
