import { NextResponse } from "next/server";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customerActivities,
  customers,
  ledgerEntries,
  orderItems,
  orderStatusHistory,
  orders,
  paymentLinkEvents,
  paymentLinks,
  paymentProviderAccounts,
  paymentProviders,
  payments,
  paymentWebhooks,
  payouts,
} from "@/database/schema";
import { createBroskiProvider } from "@/payment-providers/broski";
import { decryptSecret } from "@/lib/crypto";
import {
  buildPurchaseEventId,
  sendPurchaseToMetaCapi,
} from "@/features/pixels/meta-capi";
import { sendOrderToUtmify } from "@/features/pixels/utmify";
import { dispatchWebhookEvent } from "@/features/webhooks/dispatch";
import {
  applyPaidOrderStock,
  restoreOrderStock,
} from "@/features/variants/inventory";
import {
  canTransitionOrderStatus,
  ORDER_STATUS_BY_PAYMENT_STATUS,
} from "@/features/carts/status";
import {
  createNotification,
  type NotificationEvent,
} from "@/features/notifications/create";
import { pushEvent } from "@/features/notifications/pushcut";

/** Que notificação gerar para cada estado devolvido pelo gateway. */
const NOTIFICATION_BY_STATUS: Record<
  string,
  { eventType: NotificationEvent; title: string }
> = {
  approved: { eventType: "payment_approved", title: "Pagamento confirmado" },
  refused: { eventType: "payment_refused", title: "Pagamento recusado" },
  expired: { eventType: "payment_refused", title: "Pagamento expirado" },
  refunded: { eventType: "refund", title: "Reembolso processado" },
  chargeback: { eventType: "chargeback", title: "Chargeback aberto" },
};

interface WebhookVerifier {
  provider: ReturnType<typeof createBroskiProvider>;
  workspaceId: string | null;
  providerAccountId: string | null;
}

/**
 * Encontra o segredo que realmente pertence ao workspace. O payload é lido
 * apenas para priorizar uma conta; nada dele é confiado antes do HMAC passar.
 */
async function resolveWebhookVerifier(
  request: Request,
  rawBody: string,
): Promise<WebhookVerifier | null> {
  const db = getDb();
  const accounts = await db
    .select({
      id: paymentProviderAccounts.id,
      workspaceId: paymentProviderAccounts.workspaceId,
      environment: paymentProviderAccounts.environment,
      encryptedCredentials: paymentProviderAccounts.encryptedCredentials,
    })
    .from(paymentProviderAccounts)
    .innerJoin(
      paymentProviders,
      eq(paymentProviders.id, paymentProviderAccounts.providerId),
    )
    .where(
      and(
        eq(paymentProviders.key, "broski"),
        eq(paymentProviderAccounts.isActive, true),
      ),
    )
    .limit(100);

  for (const account of accounts) {
    try {
      if (!account.encryptedCredentials) continue;
      const credentials = JSON.parse(
        decryptSecret(account.encryptedCredentials),
      ) as { apiKey?: string; webhookSecret?: string };
      if (!credentials.apiKey || !credentials.webhookSecret) continue;
      const provider = createBroskiProvider({
        environment: account.environment,
        apiKey: credentials.apiKey,
        webhookSecret: credentials.webhookSecret,
      });
      if (await provider.verifyWebhookSignature(request, rawBody)) {
        return {
          provider,
          workspaceId: account.workspaceId,
          providerAccountId: account.id,
        };
      }
    } catch {
      // Uma credencial antiga não impede testar as outras contas.
    }
  }

  const apiKey = process.env.BROSKI_API_KEY;
  const webhookSecret = process.env.BROSKI_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) return null;
  const provider = createBroskiProvider({
    environment: "production",
    apiKey,
    webhookSecret,
  });
  return (await provider.verifyWebhookSignature(request, rawBody))
    ? { provider, workspaceId: null, providerAccountId: null }
    : null;
}

/**
 * Webhook do Broski (POST https://<dominio>/api/webhooks/broski).
 *
 * Regras (docs/PAYMENTS.md):
 * - Assinatura `Broski-Signature` SEMPRE verificada (HMAC-SHA256, ±5 min)
 * - Entrega at-least-once → deduplicação por id do evento (unique no banco)
 * - Responder 2xx em até 10 s (sem 2xx o Broski faz retries por ~24 h)
 * - Pedido só é marcado como pago aqui (order.paid), nunca no frontend
 *
 * Ativação: registrar a URL no painel Broski e definir BROSKI_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verifier = await resolveWebhookVerifier(request, rawBody);
  if (!verifier) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const event = await verifier.provider.parseWebhook(rawBody);
  const db = getDb();

  // Deduplicação: unique (provider_key, external_event_id)
  const inserted = await db
    .insert(paymentWebhooks)
    .values({
      workspaceId: verifier.workspaceId,
      providerAccountId: verifier.providerAccountId,
      providerKey: "broski",
      externalEventId: event.externalEventId,
      eventType: event.type,
      signatureValid: true,
      payload: { type: event.type, paymentExternalId: event.paymentExternalId },
    })
    .onConflictDoNothing()
    .returning({ id: paymentWebhooks.id });

  let webhookId = inserted[0]?.id;
  if (!webhookId) {
    const [existing] = await db
      .select({
        id: paymentWebhooks.id,
        processedAt: paymentWebhooks.processedAt,
        processingError: paymentWebhooks.processingError,
        updatedAt: paymentWebhooks.updatedAt,
      })
      .from(paymentWebhooks)
      .where(
        and(
          eq(paymentWebhooks.providerKey, "broski"),
          eq(paymentWebhooks.externalEventId, event.externalEventId),
        ),
      )
      .limit(1);
    if (!existing) {
      return NextResponse.json(
        { error: "deduplication_failed" },
        { status: 500 },
      );
    }
    if (existing.processedAt) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    webhookId = existing.id;
  }

  const staleBefore = new Date(Date.now() - 2 * 60_000);
  const claimed = await db
    .update(paymentWebhooks)
    .set({ processingError: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(paymentWebhooks.id, webhookId),
        isNull(paymentWebhooks.processedAt),
        or(
          isNull(paymentWebhooks.processingError),
          lt(paymentWebhooks.updatedAt, staleBefore),
        ),
      ),
    )
    .returning({ id: paymentWebhooks.id });
  if (claimed.length === 0) {
    return NextResponse.json(
      { received: true, processing: true },
      { status: 202 },
    );
  }

  if (event.paymentExternalId && event.status) {
    const paymentRows = await db
      .select({ id: payments.id, orderId: payments.orderId })
      .from(payments)
      .where(eq(payments.externalId, event.paymentExternalId))
      .limit(1);

    if (paymentRows.length > 0) {
      const { id: paymentId, orderId } = paymentRows[0];
      const now = new Date();
      let statusTransitionApplied = false;

      await db.transaction(async (tx) => {
        // Eventos diferentes do mesmo pagamento também são serializados.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${paymentId}))`,
        );

        await tx
          .update(payments)
          .set({
            status: event.status,
            approvedAt: event.status === "approved" ? now : undefined,
            updatedAt: now,
          })
          .where(eq(payments.id, paymentId));

        const newOrderStatus = ORDER_STATUS_BY_PAYMENT_STATUS[event.status!];
        if (newOrderStatus) {
          const [currentOrder] = await tx
            .select({ status: orders.status, workspaceId: orders.workspaceId })
            .from(orders)
            .where(eq(orders.id, orderId))
            .limit(1);

          if (
            currentOrder &&
            canTransitionOrderStatus(currentOrder.status, newOrderStatus)
          ) {
            await tx
              .update(orders)
              .set({
                status:
                  newOrderStatus as (typeof orders.$inferInsert)["status"],
                paidAt: event.status === "approved" ? now : undefined,
                updatedAt: now,
              })
              .where(eq(orders.id, orderId));

            await tx.insert(orderStatusHistory).values({
              workspaceId: currentOrder.workspaceId,
              orderId,
              fromStatus:
                currentOrder.status as (typeof orderStatusHistory.$inferInsert)["fromStatus"],
              toStatus:
                newOrderStatus as (typeof orderStatusHistory.$inferInsert)["toStatus"],
              reason: `Webhook Broski: ${event.type}`,
              changedBy: null,
              metadata: {
                source: "webhook",
                providerKey: "broski",
                eventType: event.type,
              },
            });
            statusTransitionApplied = true;
          }
        }

        await tx
          .update(paymentWebhooks)
          .set({ processedAt: now, paymentId, processingError: null })
          .where(eq(paymentWebhooks.id, webhookId));
      });

      // Efeitos posteriores (Meta CAPI, notificação in-app) nunca podem
      // impedir a resposta 2xx ao Broski: sem 2xx ele reenvia por ~24h, e o
      // pagamento já foi processado com sucesso aqui em cima.
      try {
        const [orderRow] = await db
          .select({
            workspaceId: orders.workspaceId,
            reference: orders.reference,
            totalCents: orders.totalCents,
            currency: orders.currency,
            customerId: orders.customerId,
            paymentLinkId: orders.paymentLinkId,
            paymentLinkPixelEnabled: paymentLinks.metaPixelEnabled,
            status: orders.status,
            createdAt: orders.createdAt,
            paidAt: orders.paidAt,
            utm: orders.utm,
            shippingAddress: orders.shippingAddress,
            checkoutUrl: orders.checkoutUrl,
            clientFbp: orders.clientFbp,
            clientFbc: orders.clientFbc,
            clientIp: orders.clientIp,
            clientUserAgent: orders.clientUserAgent,
          })
          .from(orders)
          .leftJoin(paymentLinks, eq(paymentLinks.id, orders.paymentLinkId))
          .where(eq(orders.id, orderId))
          .limit(1);

        if (orderRow) {
          // Funil do link de pagamento: o desfecho é registado aqui, com o
          // status real do gateway — nunca no clique do comprador. Só numa
          // transição efetiva, para que uma reentrega do mesmo evento não
          // conte o pagamento duas vezes no relatório.
          if (orderRow.paymentLinkId && statusTransitionApplied) {
            const LINK_EVENT_BY_STATUS: Partial<Record<string, string>> = {
              approved: "payment_paid",
              refused: "payment_failed",
              expired: "payment_failed",
            };
            const linkEvent = LINK_EVENT_BY_STATUS[event.status];
            if (linkEvent) {
              await db.insert(paymentLinkEvents).values({
                workspaceId: orderRow.workspaceId,
                paymentLinkId: orderRow.paymentLinkId,
                orderId,
                type: linkEvent,
                valueCents: orderRow.totalCents,
                metadata: { provider: "broski", eventType: event.type },
              });
            }
          }

          if (orderRow.customerId && statusTransitionApplied) {
            const activityType =
              event.status === "approved"
                ? "payment_approved"
                : event.status === "refused"
                  ? "payment_refused"
                  : event.status === "refunded"
                    ? "payment_refunded"
                    : event.status === "chargeback"
                      ? "payment_chargeback"
                      : "order_updated";
            await db.transaction(async (tx) => {
              await tx
                .update(customers)
                .set({
                  lastActivityAt: now,
                  firstPurchaseAt:
                    event.status === "approved"
                      ? sql`coalesce(${customers.firstPurchaseAt}, ${now})`
                      : undefined,
                  lastPurchaseAt: event.status === "approved" ? now : undefined,
                  updatedAt: now,
                })
                .where(eq(customers.id, orderRow.customerId as string));
              await tx.insert(customerActivities).values({
                workspaceId: orderRow.workspaceId,
                customerId: orderRow.customerId as string,
                type: activityType,
                source: "webhook",
                referenceType: "order",
                referenceId: orderId,
                metadata: { provider: "broski" },
              });
            });
          }

          // Estoque: a baixa acontece aqui, na confirmação do pagamento —
          // nunca no clique do cliente. Reembolso e chargeback devolvem as
          // unidades. As duas operações são idempotentes (o histórico em
          // inventory_movements evita baixa dupla numa reentrega).
          if (event.status === "approved") {
            await applyPaidOrderStock(orderId);
          } else if (event.status === "refunded") {
            await restoreOrderStock(orderId, "refund");
          } else if (event.status === "chargeback") {
            await restoreOrderStock(orderId, "chargeback");
          }

          // Lançamento automático no livro-caixa (Financeiro → Entradas/Saídas).
          // Usa o valor bruto do pedido — o Broski não retorna a taxa cobrada
          // em nenhum ponto do fluxo, então nunca lançamos gateway_fee aqui.
          const LEDGER_ENTRY_BY_STATUS: Partial<
            Record<
              string,
              {
                type: "sale" | "refund" | "chargeback";
                direction: "in" | "out";
              }
            >
          > = {
            approved: { type: "sale", direction: "in" },
            refunded: { type: "refund", direction: "out" },
            chargeback: { type: "chargeback", direction: "out" },
          };
          const ledgerPlan = LEDGER_ENTRY_BY_STATUS[event.status];
          if (ledgerPlan && statusTransitionApplied) {
            await db.insert(ledgerEntries).values({
              workspaceId: orderRow.workspaceId,
              type: ledgerPlan.type,
              direction: ledgerPlan.direction,
              description: `Pedido ${orderRow.reference}`,
              amountCents: orderRow.totalCents,
              currency: orderRow.currency,
              status: "confirmed",
              orderId,
              paymentId,
              gatewayKey: "broski",
            });
          }

          // Webhooks de saída cadastrados pelo utilizador (Fase Webhooks).
          // Disparo síncrono, sem fila — ver limitações em dispatch.ts.
          const OUTBOUND_EVENT_BY_STATUS: Partial<Record<string, string>> = {
            approved: "order.paid",
            refused: "order.refused",
            refunded: "order.refunded",
            chargeback: "order.chargeback",
          };
          const outboundEvent = OUTBOUND_EVENT_BY_STATUS[event.status];
          if (outboundEvent) {
            await dispatchWebhookEvent(orderRow.workspaceId, outboundEvent, {
              orderId,
              reference: orderRow.reference,
              totalCents: orderRow.totalCents,
              currency: orderRow.currency,
            });
          }

          const [customerRow] = orderRow.customerId
            ? await db
                .select({
                  email: customers.email,
                  phone: customers.phone,
                  firstName: customers.firstName,
                  lastName: customers.lastName,
                  document: customers.document,
                  country: customers.country,
                })
                .from(customers)
                .where(eq(customers.id, orderRow.customerId))
                .limit(1)
            : [undefined];

          // Preserva a integração UTMify existente no origin/main.
          const itemRows = await db
            .select({
              productId: orderItems.productId,
              productName: orderItems.productName,
              variantName: orderItems.variantName,
              sku: orderItems.sku,
              quantity: orderItems.quantity,
              unitPriceCents: orderItems.unitPriceCents,
            })
            .from(orderItems)
            .where(eq(orderItems.orderId, orderId));

          await sendOrderToUtmify({
            workspaceId: orderRow.workspaceId,
            orderId,
            reference: orderRow.reference,
            orderStatus: orderRow.status,
            totalCents: orderRow.totalCents,
            currency: orderRow.currency,
            createdAt: orderRow.createdAt,
            paidAt: orderRow.paidAt,
            customer: customerRow
              ? {
                  name: [customerRow.firstName, customerRow.lastName]
                    .filter(Boolean)
                    .join(" "),
                  email: customerRow.email,
                  phone: customerRow.phone,
                  document: customerRow.document,
                  country: customerRow.country,
                }
              : undefined,
            items: itemRows.map((item) => ({
              id: item.productId,
              name: item.variantName
                ? `${item.productName} — ${item.variantName}`
                : item.productName,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
            })),
            utm: (orderRow.utm as Record<string, string> | null) ?? null,
          });

          // Purchase pelo pagamento aprovado. Sempre tenta enviar — se o
          // checkout já enviou este pedido como "generated_order", o índice
          // único (pixelId, eventId, channel) em pixel_events bloqueia
          // silenciosamente um segundo envio, sem precisar checar a regra
          // aqui de novo.
          if (
            event.status === "approved" &&
            orderRow.paymentLinkPixelEnabled !== false
          ) {
            const landingPageId =
              (orderRow.utm as Record<string, string> | null)?.lp ?? null;
            const shippingAddress = (orderRow.shippingAddress ?? {}) as Record<
              string,
              string | undefined
            >;

            await sendPurchaseToMetaCapi({
              workspaceId: orderRow.workspaceId,
              orderId,
              landingPageId,
              paymentLinkId: orderRow.paymentLinkId,
              eventId: buildPurchaseEventId(orderId),
              triggerType: "payment_approved",
              valueCents: orderRow.totalCents,
              currency: orderRow.currency,
              email: customerRow?.email,
              phone: customerRow?.phone,
              firstName: customerRow?.firstName,
              lastName: customerRow?.lastName,
              city: shippingAddress.city,
              state: shippingAddress.state,
              postalCode: shippingAddress.postal_code,
              country: customerRow?.country ?? shippingAddress.country,
              externalId: orderRow.customerId,
              productName: itemRows[0]
                ? itemRows[0].variantName
                  ? `${itemRows[0].productName} — ${itemRows[0].variantName}`
                  : itemRows[0].productName
                : undefined,
              contentIds: itemRows
                .map((item) => item.sku)
                .filter((sku): sku is string => Boolean(sku)),
              quantity: itemRows.reduce((sum, item) => sum + item.quantity, 0),
              sourceUrl: orderRow.checkoutUrl,
              fbp: orderRow.clientFbp,
              fbc: orderRow.clientFbc,
              ip: orderRow.clientIp,
              userAgent: orderRow.clientUserAgent,
            });
          }

          const notice = NOTIFICATION_BY_STATUS[event.status];
          if (notice && statusTransitionApplied) {
            const amount = (orderRow.totalCents / 100).toLocaleString("pt-PT", {
              style: "currency",
              currency: orderRow.currency,
            });
            const detail = `Pedido ${orderRow.reference}${
              customerRow?.email ? ` · ${customerRow.email}` : ""
            }`;

            await createNotification({
              workspaceId: orderRow.workspaceId,
              eventType: notice.eventType,
              title: notice.title,
              body: detail,
              href: "/pedidos",
              valueCents: orderRow.totalCents,
              metadata: { orderId, reference: orderRow.reference },
            });

            // Push no telemóvel, pelo canal que o utilizador atribuiu a
            // este evento (venda gerada / venda aprovada).
            await pushEvent(
              orderRow.workspaceId,
              notice.eventType,
              `${notice.title} · ${amount}`,
              detail,
            );
          }
        }
      } catch (error) {
        console.error(
          "[webhook/broski] erro nos efeitos pós-pagamento:",
          error,
        );
      }
    } else {
      await db
        .update(paymentWebhooks)
        .set({ processingError: "payment_not_found", updatedAt: new Date() })
        .where(eq(paymentWebhooks.id, webhookId));
      return NextResponse.json(
        { error: "payment_not_found_retry" },
        { status: 503 },
      );
    }
  } else if (event.type === "payout.paid") {
    // Suporte defensivo: a Broski documenta este evento (docs/PAYMENTS.md),
    // mas o formato exato do objeto "payout" nunca foi confirmado com um
    // evento real (sem credenciais de produção até agora). Lemos o payload
    // cru com fallback em vários nomes de campo plausíveis, sem travar o
    // resto do webhook se algum campo vier diferente do esperado — quando o
    // primeiro evento real chegar, este parsing deve ser revisado e travado
    // ao formato confirmado.
    try {
      const raw = event.raw as {
        data?: { object?: Record<string, unknown> };
      };
      const payoutObject = raw?.data?.object ?? {};

      const externalId =
        typeof payoutObject.id === "string"
          ? payoutObject.id
          : event.externalEventId;
      const amountCents =
        typeof payoutObject.amount === "number"
          ? payoutObject.amount
          : event.amountCents;
      const currency =
        typeof payoutObject.currency === "string"
          ? payoutObject.currency.toUpperCase()
          : "EUR";
      const arrivedAtRaw =
        (payoutObject.paid_at as string | undefined) ??
        (payoutObject.arrived_at as string | undefined);
      const bankAccountLabel =
        (payoutObject.bank_account as string | undefined) ??
        (payoutObject.destination as string | undefined) ??
        null;

      if (typeof amountCents === "number") {
        const workspaceId = verifier.workspaceId;
        if (!workspaceId) {
          throw new Error(
            "Payout assinado pela credencial global sem workspace associado.",
          );
        }

        await db
          .insert(payouts)
          .values({
            workspaceId,
            providerAccountId: verifier.providerAccountId,
            externalId,
            status: "paid",
            amountCents,
            currency,
            source: "api",
            bankAccountLabel,
            arrivedAt: arrivedAtRaw ? new Date(arrivedAtRaw) : new Date(),
          })
          .onConflictDoUpdate({
            target: payouts.externalId,
            set: {
              status: "paid",
              amountCents,
              currency,
              arrivedAt: arrivedAtRaw ? new Date(arrivedAtRaw) : new Date(),
              updatedAt: new Date(),
            },
          });
      } else {
        console.error(
          "[webhook/broski] evento payout.paid sem valor reconhecível.",
        );
      }

      await db
        .update(paymentWebhooks)
        .set({ processedAt: new Date(), processingError: null })
        .where(eq(paymentWebhooks.id, webhookId));
    } catch (error) {
      console.error("[webhook/broski] erro ao processar payout.paid:", error);
      await db
        .update(paymentWebhooks)
        .set({
          processingError:
            error instanceof Error ? error.name.slice(0, 120) : "payout_error",
          updatedAt: new Date(),
        })
        .where(eq(paymentWebhooks.id, webhookId));
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }
  } else {
    await db
      .update(paymentWebhooks)
      .set({ processedAt: new Date(), processingError: null })
      .where(eq(paymentWebhooks.id, webhookId));
  }

  return NextResponse.json({ received: true });
}
