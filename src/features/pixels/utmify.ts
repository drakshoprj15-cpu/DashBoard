import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/database/client";
import { pixelEvents, pixels } from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";

const UTMIFY_ORDERS_URL = "https://api.utmify.com.br/api-credentials/orders";

/**
 * Status de pedido da plataforma → status aceito pela API da UTMify.
 * https://docs.utmify.com.br/envio-de-vendas (consultado 2026-07-31).
 */
const UTMIFY_STATUS_MAP: Partial<Record<string, string>> = {
  created: "waiting_payment",
  awaiting_payment: "waiting_payment",
  processing: "waiting_payment",
  paid: "paid",
  refused: "refused",
  expired: "refused",
  refunded: "refunded",
  chargeback: "chargedback",
};

/** "YYYY-MM-DD HH:MM:SS" em UTC, formato exigido pela API. */
function utmifyTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * A UTMify só aceita paymentMethod em {credit_card, boleto, pix, paypal,
 * free_price} — MB WAY e Multibanco (os únicos métodos reais desta loja)
 * não têm correspondência exata na API deles. "pix" é o mais próximo
 * semanticamente (pagamento instantâneo por app/referência, sem cartão),
 * mas isto é uma aproximação, não uma tradução correta — documentado aqui
 * para não ser confundido com um mapeamento oficial.
 */
const UTMIFY_PAYMENT_METHOD_FALLBACK = "pix";

export interface OrderReportInput {
  workspaceId: string;
  orderId: string;
  reference: string;
  /** Status já traduzido para o vocabulário da plataforma (orders.status). */
  orderStatus: string;
  totalCents: number;
  currency: string;
  createdAt: Date;
  paidAt?: Date | null;
  refundedAt?: Date | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    document?: string | null;
    country?: string | null;
  };
  items: { id: string | null; name: string; quantity: number; unitPriceCents: number }[];
  /** orders.utm já normalizado (utm_source, utm_campaign, ...). */
  utm?: Record<string, string> | null;
}

/**
 * Reporta o pedido à UTMify (atribuição de vendas a campanhas).
 *
 * Chamado apenas a partir do webhook de pagamento — nunca do navegador. Sem
 * pixel do tipo `utmify` configurado, não faz nada (não é erro). Limitações
 * conhecidas: `customer.ip` é omitido (não coletamos IP em `customers`) e
 * `commission.gatewayFeeInCents` não é enviado (a Broski não informa a taxa
 * do gateway em nenhum ponto do fluxo).
 */
export async function sendOrderToUtmify(input: OrderReportInput): Promise<void> {
  const utmifyStatus = UTMIFY_STATUS_MAP[input.orderStatus];
  if (!utmifyStatus) return;

  const db = getDb();

  const rows = await db
    .select()
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, input.workspaceId),
        eq(pixels.type, "utmify"),
        eq(pixels.isActive, true),
        isNull(pixels.deletedAt),
      ),
    );

  for (const pixel of rows) {
    if (!pixel.encryptedToken) continue;

    // Deduplicação: mesmo pedido no mesmo status nunca é reenviado, mas uma
    // mudança de status (ex.: waiting_payment → paid) gera um novo evento.
    const eventId = `${input.orderId}_${utmifyStatus}`;
    const inserted = await db
      .insert(pixelEvents)
      .values({
        workspaceId: input.workspaceId,
        pixelId: pixel.id,
        eventName: `order.${utmifyStatus}`,
        eventId,
        channel: "server",
        orderId: input.orderId,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: pixelEvents.id });

    if (inserted.length === 0) continue;

    try {
      const token = decryptSecret(pixel.encryptedToken);

      const body = {
        orderId: input.reference,
        platform: "Infinity",
        paymentMethod: UTMIFY_PAYMENT_METHOD_FALLBACK,
        status: utmifyStatus,
        createdAt: utmifyTimestamp(input.createdAt),
        approvedDate: input.paidAt ? utmifyTimestamp(input.paidAt) : null,
        refundedAt: input.refundedAt ? utmifyTimestamp(input.refundedAt) : null,
        customer: {
          name: input.customer?.name || "Cliente",
          email: input.customer?.email || undefined,
          phone: input.customer?.phone || undefined,
          // A API exige o campo mesmo sem CPF/NIF — aceita null explícito
          // (confirmado via SCHEMA_VALIDATION_FAILED em teste real; a doc
          // pública não deixava isso claro).
          document: input.customer?.document || null,
          country: input.customer?.country || "PT",
        },
        products: input.items.map((item) => ({
          id: item.id ?? input.orderId,
          name: item.name,
          planId: null,
          planName: null,
          quantity: item.quantity,
          priceInCents: item.unitPriceCents,
        })),
        trackingParameters: {
          src: null,
          sck: null,
          utm_source: input.utm?.utm_source ?? null,
          utm_campaign: input.utm?.utm_campaign ?? null,
          utm_medium: input.utm?.utm_medium ?? null,
          utm_content: input.utm?.utm_content ?? null,
          utm_term: input.utm?.utm_term ?? null,
        },
        // gatewayFeeInCents/userCommissionInCents são exigidos pela API
        // (confirmado via SCHEMA_VALIDATION_FAILED em teste real — a doc
        // pública não os listava como obrigatórios). A Broski não informa a
        // taxa do gateway em nenhum ponto do fluxo (mesma limitação já
        // documentada no lançamento do livro-caixa), então enviamos 0 em
        // vez de inventar um valor — a UTMify recebe o total correto, só
        // sem a quebra de taxa/comissão.
        commission: {
          totalPriceInCents: input.totalCents,
          gatewayFeeInCents: 0,
          userCommissionInCents: input.totalCents,
        },
        isTest: false,
      };

      const response = await fetch(UTMIFY_ORDERS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-token": token,
        },
        body: JSON.stringify(body),
      });

      const responseBody = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      await db
        .update(pixelEvents)
        .set({
          status: response.ok ? "sent" : "failed",
          sentAt: new Date(),
          response: responseBody,
          error: response.ok ? null : JSON.stringify(responseBody).slice(0, 500),
        })
        .where(eq(pixelEvents.id, inserted[0].id));

      if (response.ok) {
        await db
          .update(pixels)
          .set({ lastActivityAt: new Date() })
          .where(eq(pixels.id, pixel.id));
      }
    } catch (error) {
      await db
        .update(pixelEvents)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "erro desconhecido",
        })
        .where(eq(pixelEvents.id, inserted[0].id));
    }
  }
}
