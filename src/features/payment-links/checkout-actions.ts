"use server";

import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customerActivities,
  customerAddresses,
  customers,
  orderItems,
  orders,
  paymentLinkEvents,
  payments,
} from "@/database/schema";
import {
  normalizeEmail,
  normalizePhone,
} from "@/features/customers/customer-utils";
import { createNotification } from "@/features/notifications/create";
import { pushEvent } from "@/features/notifications/pushcut";
import { captureRequestAttribution } from "@/features/pixels/attribution";
import {
  countPaidPayments,
  getPaymentLinkBySlug,
} from "@/features/payment-links/queries";
import { computeLinkTotal } from "@/features/payment-links/pricing";
import { buildPaymentAttemptIdempotencyKey } from "@/features/payment-links/slug";
import { resolveLinkState } from "@/features/payment-links/types";
import { formatMoney } from "@/lib/format";
import { getRequestUrl } from "@/lib/request-url";
import { rateLimit } from "@/lib/rate-limit";
import { BroskiApiError } from "@/payment-providers/broski";
import {
  getWorkspacePaymentProvider,
  PaymentProviderNotConfiguredError,
} from "@/payment-providers/resolve";
import { normalizePtPhone } from "@/validations/checkout";
import {
  paymentLinkCheckoutSchema,
  paymentLinkVisitorKeySchema,
  validateCustomerFields,
  type PaymentLinkCheckoutInput,
} from "@/validations/payment-link";

export type PaymentLinkCheckoutResult =
  | { status: "validation_error"; error: string; field?: string }
  | { status: "link_unavailable"; reason: string; message: string }
  | { status: "payment_error"; error: string }
  | {
      status: "payment_created";
      method: "mbway" | "multibanco";
      orderId: string;
      reference: string;
      totalCents: number;
      currency: string;
      mbwayPhone?: string;
      multibanco?: {
        entity: string;
        reference: string;
        amountCents: number;
        expiresAt?: string;
      };
    };

/** Mensagens de link indisponível — humanas, nunca um erro cru. */
const UNAVAILABLE_MESSAGE: Record<string, string> = {
  disabled: "Este link de pagamento já não está disponível.",
  expired: "Este link de pagamento expirou.",
  exhausted: "Este pagamento já foi realizado.",
  archived: "Este link de pagamento já não está disponível.",
  not_found: "Link de pagamento não encontrado.",
};

function generateOrderReference(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `PL-${stamp}${rand}`;
}

/** Regista um passo do funil sem nunca derrubar o fluxo de pagamento. */
async function recordEvent(
  workspaceId: string,
  paymentLinkId: string,
  type: string,
  extra: {
    orderId?: string;
    method?: string;
    valueCents?: number;
    metadata?: Record<string, unknown>;
    visitorKey?: string;
  } = {},
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await getDb()
      .insert(paymentLinkEvents)
      .values({
        workspaceId,
        paymentLinkId,
        type,
        orderId: extra.orderId,
        method: extra.method,
        valueCents: extra.valueCents,
        metadata: extra.metadata ?? {},
        visitorKey: extra.visitorKey,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error("[payment-links] falha ao registar evento:", error);
  }
}

/** Evento de visita — chamado pela página pública ao renderizar. */
export async function trackPaymentLinkViewAction(
  slug: string,
  visitorKey: string,
): Promise<void> {
  const visitor = paymentLinkVisitorKeySchema.safeParse(visitorKey);
  if (!visitor.success) return;
  const record = await getPaymentLinkBySlug(slug);
  if (!record) return;
  await recordEvent(record.workspaceId, record.id, "view", {
    valueCents: record.amountCents,
    visitorKey: visitor.data,
  });
}

/** Primeiro campo preenchido pelo comprador. */
export async function trackPaymentLinkFormStartedAction(
  slug: string,
  visitorKey: string,
): Promise<void> {
  const visitor = paymentLinkVisitorKeySchema.safeParse(visitorKey);
  if (!visitor.success) return;
  const record = await getPaymentLinkBySlug(slug);
  if (!record) return;
  await recordEvent(record.workspaceId, record.id, "form_started", {
    visitorKey: visitor.data,
  });
}

/**
 * Cobrança já em curso para este comprador neste link.
 *
 * É a proteção contra duplo clique, refresh e reenvio: em vez de abrir um
 * segundo pedido no gateway, devolvemos o que já existe. A janela de 20
 * minutos cobre a validade prática de um MB WAY pendente.
 */
async function findReusablePayment(
  workspaceId: string,
  paymentLinkId: string,
  customerId: string,
  method: string,
): Promise<{
  orderId: string;
  reference: string;
  totalCents: number;
  currency: string;
  externalId: string | null;
  metadata: unknown;
} | null> {
  const db = getDb();
  const since = new Date(Date.now() - 20 * 60_000);

  const [row] = await db
    .select({
      orderId: orders.id,
      reference: orders.reference,
      totalCents: orders.totalCents,
      currency: orders.currency,
      externalId: payments.externalId,
      metadata: payments.metadata,
      orderStatus: orders.status,
    })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        eq(orders.paymentLinkId, paymentLinkId),
        eq(orders.customerId, customerId),
        eq(payments.method, method),
        gte(orders.createdAt, since),
        or(
          eq(orders.status, "created"),
          eq(orders.status, "awaiting_payment"),
          eq(orders.status, "processing"),
        ),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  return row ?? null;
}

async function findPaymentByIdempotencyKey(idempotencyKey: string) {
  const [row] = await getDb()
    .select({
      orderId: orders.id,
      reference: orders.reference,
      totalCents: orders.totalCents,
      currency: orders.currency,
      externalId: payments.externalId,
      metadata: payments.metadata,
      method: payments.method,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(payments.idempotencyKey, idempotencyKey))
    .limit(1);
  return row ?? null;
}

class DuplicatePaymentAttemptError extends Error {
  constructor() {
    super("duplicate_payment_attempt");
    this.name = "DuplicatePaymentAttemptError";
  }
}

class PaymentLinkCapacityError extends Error {
  constructor() {
    super("payment_link_capacity_reached");
    this.name = "PaymentLinkCapacityError";
  }
}

function toCreatedPaymentResult(
  row: NonNullable<Awaited<ReturnType<typeof findPaymentByIdempotencyKey>>>,
  phone?: string,
): PaymentLinkCheckoutResult {
  const method = row.method === "multibanco" ? "multibanco" : "mbway";
  const metadata = (row.metadata ?? {}) as {
    multibancoEntity?: string;
    multibancoReference?: string;
    multibancoExpiresAt?: string;
  };
  return {
    status: "payment_created",
    method,
    orderId: row.orderId,
    reference: row.reference,
    totalCents: row.totalCents,
    currency: row.currency,
    mbwayPhone: method === "mbway" ? phone : undefined,
    multibanco:
      method === "multibanco" &&
      metadata.multibancoEntity &&
      metadata.multibancoReference
        ? {
            entity: metadata.multibancoEntity,
            reference: metadata.multibancoReference,
            amountCents: row.totalCents,
            expiresAt: metadata.multibancoExpiresAt,
          }
        : undefined,
  };
}

/**
 * Cria a cobrança de um link de pagamento.
 *
 * Fluxo: link do banco → estado → dados do comprador → total recalculado →
 * cliente (upsert) → pedido + item + pagamento → gateway. A confirmação NÃO
 * acontece aqui: quem marca como pago é o webhook, com o status real do
 * processador.
 */
export async function submitPaymentLinkCheckoutAction(
  input: PaymentLinkCheckoutInput,
): Promise<PaymentLinkCheckoutResult> {
  const parsed = paymentLinkCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "validation_error",
      error: parsed.error.issues[0].message,
    };
  }

  const data = parsed.data;

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const clientIdentifier =
    forwardedFor || requestHeaders.get("x-real-ip") || "unknown-client";
  const limit = await rateLimit({
    namespace: "payment-link-checkout",
    identifier: `${data.slug}:${clientIdentifier}`,
    limit: 8,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return {
      status: "payment_error",
      error:
        "Foram feitas várias tentativas. Aguarde um minuto e tente novamente.",
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: "payment_error",
      error:
        "O pagamento não pode ser processado neste momento. Nenhum valor foi cobrado.",
    };
  }

  const record = await getPaymentLinkBySlug(data.slug);
  if (!record) {
    return {
      status: "link_unavailable",
      reason: "not_found",
      message: UNAVAILABLE_MESSAGE.not_found,
    };
  }

  if (!record.paymentMethods.includes(data.method)) {
    return {
      status: "validation_error",
      error: "Este método de pagamento não está ativo neste link.",
      field: "method",
    };
  }

  // Estado revalidado no servidor: um link desativado entre a abertura da
  // página e o clique não pode cobrar.
  const paidCount = await countPaidPayments(record.id);
  const state = resolveLinkState({
    isActive: record.isActive,
    status: record.status,
    archivedAt: record.archivedAt,
    expiresAt: record.expiresAt,
    maxPayments: record.maxPayments,
    paidCount,
  });

  if (state !== "active") {
    return {
      status: "link_unavailable",
      reason: state,
      message: UNAVAILABLE_MESSAGE[state] ?? UNAVAILABLE_MESSAGE.disabled,
    };
  }

  const fieldErrors = validateCustomerFields(data, {
    requestName: record.requestName,
    requestEmail: record.requestEmail,
    requestPhone: record.requestPhone,
    requiresAddress: record.requiresAddress,
    customerFields: record.customerFields,
  });

  if (fieldErrors.length > 0) {
    return {
      status: "validation_error",
      error: fieldErrors[0].message,
      field: fieldErrors[0].field,
    };
  }

  const { subtotal, shipping, total, shippingName } = computeLinkTotal(
    record,
    data.shippingOptionId || undefined,
  );

  const db = getDb();
  const workspaceId = record.workspaceId;
  const phone = data.phone ? normalizePtPhone(data.phone) : undefined;
  const now = new Date();

  // Sem e-mail informado (campo oculto no link), geramos um endereço técnico
  // estável a partir do telemóvel: o CRM exige e-mail, e um placeholder por
  // pagamento criaria um cliente novo a cada compra da mesma pessoa.
  const rawEmail = (data.email ?? "").trim().toLowerCase();
  const email =
    rawEmail ||
    (phone ? `${phone.replace(/\D/g, "")}@sem-email.pagamento` : "");

  if (!email) {
    return {
      status: "validation_error",
      error: "Informe o seu e-mail ou telemóvel para continuar.",
      field: "email",
    };
  }

  const [firstName, ...restName] = (data.name ?? "").trim().split(/\s+/);
  const lastName = (data.lastName ?? "").trim() || restName.join(" ");
  let reservedOrderId: string | null = null;
  let reservedPaymentId: string | null = null;

  try {
    const normalizedEmail = normalizeEmail(email) ?? email;
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    // Cliente: upsert por e-mail dentro do workspace — a mesma pessoa a pagar
    // dez vezes continua a ser um cliente só.
    const [existingCustomer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.workspaceId, workspaceId),
          or(
            eq(customers.normalizedEmail, normalizedEmail),
            eq(customers.email, normalizedEmail),
          ),
        ),
      )
      .limit(1);

    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await db
        .update(customers)
        .set({
          // Só campos seguros: nome e telefone informados agora, nunca
          // apagando o que já existia com um campo vazio.
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone ?? undefined,
          normalizedPhone: normalizedPhone ?? undefined,
          document: data.document || undefined,
          country: data.country,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(customers.id, customerId));
    } else {
      const [created] = await db
        .insert(customers)
        .values({
          workspaceId,
          email: normalizedEmail,
          normalizedEmail,
          emailStatus: rawEmail ? "valid" : "unknown",
          firstName: firstName || null,
          lastName: lastName || null,
          phone,
          normalizedPhone,
          document: data.document || null,
          country: data.country,
          source: "payment_link",
          firstSource: "payment_link",
          firstSeenAt: now,
          lastActivityAt: now,
        })
        .returning({ id: customers.id });
      customerId = created.id;
    }

    if (record.requiresAddress) {
      const [existingAddress] = await db
        .select({ id: customerAddresses.id })
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.workspaceId, workspaceId),
            eq(customerAddresses.customerId, customerId),
            eq(customerAddresses.isDefault, true),
          ),
        )
        .limit(1);
      const addressValues = {
        country: data.country,
        state: data.region || null,
        city: data.city || null,
        street: data.addressLine1 || null,
        complement: data.addressLine2 || null,
        postalCode: data.postalCode || null,
        updatedAt: now,
      };
      if (existingAddress) {
        await db
          .update(customerAddresses)
          .set(addressValues)
          .where(eq(customerAddresses.id, existingAddress.id));
      } else {
        await db.insert(customerAddresses).values({
          workspaceId,
          customerId,
          label: "Pagamento",
          isDefault: true,
          ...addressValues,
        });
      }
    }

    // Idempotência: duplo clique, refresh ou retry devolvem a MESMA cobrança.
    const reusable = await findReusablePayment(
      workspaceId,
      record.id,
      customerId,
      data.method,
    );

    if (reusable) {
      const meta = (reusable.metadata ?? {}) as {
        multibancoEntity?: string;
        multibancoReference?: string;
        multibancoExpiresAt?: string;
      };
      return {
        status: "payment_created",
        method: data.method,
        orderId: reusable.orderId,
        reference: reusable.reference,
        totalCents: reusable.totalCents,
        currency: reusable.currency,
        mbwayPhone: data.method === "mbway" ? phone : undefined,
        multibanco:
          data.method === "multibanco" &&
          meta.multibancoEntity &&
          meta.multibancoReference
            ? {
                entity: meta.multibancoEntity,
                reference: meta.multibancoReference,
                amountCents: reusable.totalCents,
                expiresAt: meta.multibancoExpiresAt,
              }
            : undefined,
      };
    }

    const shippingAddress = record.requiresAddress
      ? {
          line1: data.addressLine1,
          line2: data.addressLine2 || undefined,
          postal_code: data.postalCode,
          city: data.city,
          region: data.region || undefined,
          country: data.country,
        }
      : null;

    const idempotencyKey = buildPaymentAttemptIdempotencyKey(
      record.id,
      data.attemptId,
    );
    const existingAttempt = await findPaymentByIdempotencyKey(idempotencyKey);
    if (existingAttempt) return toCreatedPaymentResult(existingAttempt, phone);

    const { provider, providerKey, providerAccountId } =
      await getWorkspacePaymentProvider(workspaceId);
    const appUrl = await getRequestUrl();
    const returnUrl = `${appUrl}/pagar/${record.slug}`;
    const reference = generateOrderReference();
    const itemName = record.productSnapshot?.name ?? record.title;

    let reservation: { orderId: string; paymentId: string };
    try {
      reservation = await db.transaction(async (tx) => {
        if (record.maxPayments !== null) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`payment-link:${record.id}`}))`,
          );
          const [reservedCount] = await tx
            .select({ value: sql<number>`count(*)::int` })
            .from(orders)
            .where(
              and(
                eq(orders.paymentLinkId, record.id),
                inArray(orders.status, [
                  "created",
                  "awaiting_payment",
                  "processing",
                  "paid",
                  "preparing",
                  "shipped",
                  "delivered",
                ]),
              ),
            );
          if ((reservedCount?.value ?? 0) >= record.maxPayments) {
            throw new PaymentLinkCapacityError();
          }
        }

        const [order] = await tx
          .insert(orders)
          .values({
            workspaceId,
            reference,
            customerId,
            paymentLinkId: record.id,
            status: "created",
            currency: record.currency,
            subtotalCents: subtotal,
            shippingCents: shipping,
            totalCents: total,
            shippingAddress,
            shippingMethod: shippingName,
            origin: "payment_link",
            countryCode: data.country,
          })
          .returning({ id: orders.id });

        const [payment] = await tx
          .insert(payments)
          .values({
            workspaceId,
            orderId: order.id,
            providerAccountId,
            status: "created",
            method: data.method,
            amountCents: total,
            currency: record.currency,
            idempotencyKey,
            metadata: { provider: providerKey, paymentLinkId: record.id },
          })
          .onConflictDoNothing({ target: payments.idempotencyKey })
          .returning({ id: payments.id });
        if (!payment) throw new DuplicatePaymentAttemptError();

        await tx.insert(orderItems).values({
          workspaceId,
          orderId: order.id,
          productId: record.productId,
          productName: itemName,
          imageUrl: record.productSnapshot?.imageUrl || null,
          currency: record.currency,
          quantity: record.productSnapshot?.quantity ?? 1,
          unitPriceCents: subtotal,
          totalCents: subtotal,
        });

        await tx.insert(customerActivities).values({
          workspaceId,
          customerId,
          type: "checkout_started",
          source: "payment_link",
          referenceType: "order",
          referenceId: order.id,
          metadata: { paymentLinkId: record.id },
        });

        return { orderId: order.id, paymentId: payment.id };
      });
    } catch (error) {
      if (error instanceof DuplicatePaymentAttemptError) {
        const duplicate = await findPaymentByIdempotencyKey(idempotencyKey);
        if (duplicate) return toCreatedPaymentResult(duplicate, phone);
      }
      if (error instanceof PaymentLinkCapacityError) {
        return {
          status: "link_unavailable",
          reason: "exhausted",
          message: UNAVAILABLE_MESSAGE.exhausted,
        };
      }
      throw error;
    }

    reservedOrderId = reservation.orderId;
    reservedPaymentId = reservation.paymentId;

    await recordEvent(workspaceId, record.id, "payment_started", {
      orderId: reservation.orderId,
      method: data.method,
      valueCents: total,
    });

    const result = await provider.createPayment({
      idempotencyKey,
      orderId: reference,
      amountCents: total,
      currency: record.currency,
      method: data.method,
      customer: {
        id: customerId,
        name: (data.name ?? "").trim() || "Cliente",
        email,
        phone,
        ...(shippingAddress
          ? {
              address: {
                line1: data.addressLine1 ?? "",
                postalCode: data.postalCode ?? "",
                city: data.city ?? "",
                country: data.country,
              },
            }
          : {}),
      },
      successUrl: returnUrl,
      metadata: {
        description: record.title.slice(0, 140),
        checkoutUrl: returnUrl,
        productType: record.requiresAddress ? "physical" : "digital",
      },
    });

    await db
      .update(payments)
      .set({
        externalId: result.externalId,
        status: result.status,
        metadata: {
          provider: providerKey,
          paymentLinkId: record.id,
          multibancoEntity: result.displayData?.multibancoEntity,
          multibancoReference: result.displayData?.multibancoReference,
          multibancoExpiresAt: result.displayData?.multibancoExpiresAt,
        },
        updatedAt: new Date(),
      })
      .where(eq(payments.id, reservation.paymentId));

    await db
      .update(orders)
      .set({
        status: "awaiting_payment",
        checkoutUrl: returnUrl,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, reservation.orderId));

    await recordEvent(workspaceId, record.id, "payment_pending", {
      orderId: reservation.orderId,
      method: data.method,
      valueCents: total,
    });

    // Efeitos posteriores nunca podem derrubar um pagamento já criado no
    // gateway — daí o try isolado.
    try {
      const attribution = await captureRequestAttribution();
      await db
        .update(orders)
        .set({
          clientFbp: attribution.fbp,
          clientFbc: attribution.fbc,
          clientIp: attribution.ip,
          clientUserAgent: attribution.userAgent,
        })
        .where(eq(orders.id, reservation.orderId));

      const amount = formatMoney(total, record.currency, "pt-PT");
      const detail = `${record.name || record.title} · ${reference} · ${
        data.method === "mbway" ? "MB WAY" : "Multibanco"
      }`;

      await createNotification({
        workspaceId,
        eventType: "order_created",
        title: "Cobrança gerada por link",
        body: detail,
        href: "/financeiro/links-de-pagamento",
        valueCents: total,
        metadata: {
          orderId: reservation.orderId,
          reference,
          paymentLinkId: record.id,
        },
      });

      await pushEvent(
        workspaceId,
        "order_created",
        `Cobrança gerada · ${amount}`,
        detail,
      );
    } catch (error) {
      console.error("[payment-links] falha nos efeitos pós-cobrança:", error);
    }

    return {
      status: "payment_created",
      method: data.method,
      orderId: reservation.orderId,
      reference,
      totalCents: total,
      currency: record.currency,
      mbwayPhone: data.method === "mbway" ? phone : undefined,
      multibanco:
        data.method === "multibanco" &&
        result.displayData?.multibancoEntity &&
        result.displayData?.multibancoReference
          ? {
              entity: result.displayData.multibancoEntity,
              reference: result.displayData.multibancoReference,
              amountCents: total,
              expiresAt: result.displayData.multibancoExpiresAt,
            }
          : undefined,
    };
  } catch (error) {
    console.error("[payment-links] erro ao criar cobrança:", error);
    if (reservedOrderId && reservedPaymentId) {
      const definitiveFailure = error instanceof BroskiApiError;
      await Promise.all([
        db
          .update(payments)
          .set({
            status: definitiveFailure ? "refused" : "processing",
            failureReason: definitiveFailure
              ? error.message.slice(0, 240)
              : null,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, reservedPaymentId)),
        db
          .update(orders)
          .set({
            status: definitiveFailure ? "refused" : "processing",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, reservedOrderId)),
      ]).catch((updateError) => {
        console.error(
          "[payment-links] falha ao persistir erro da cobrança:",
          updateError,
        );
      });
    }
    await recordEvent(workspaceId, record.id, "payment_failed", {
      method: data.method,
      metadata: {
        error: error instanceof Error ? error.name : "unknown",
      },
    });

    if (error instanceof PaymentProviderNotConfiguredError) {
      return {
        status: "payment_error",
        error:
          "Os pagamentos estão temporariamente indisponíveis. Nenhum valor foi cobrado.",
      };
    }
    if (error instanceof BroskiApiError) {
      // O texto do gateway é útil (telemóvel inválido, valor mínimo…), mas
      // nunca expomos código nem stack: só a mensagem tratada.
      return {
        status: "payment_error",
        error: `Não foi possível concluir o pagamento: ${error.message}`,
      };
    }
    return {
      status: "payment_error",
      error:
        "Não foi possível iniciar o pagamento. Nenhum valor foi cobrado — tente novamente em instantes.",
    };
  }
}
