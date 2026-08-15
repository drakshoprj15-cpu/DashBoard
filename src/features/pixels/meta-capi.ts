import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { after } from "next/server";

import { getDb } from "@/database/client";
import {
  customers,
  orderItems,
  orders,
  pixelEvents,
  pixels,
} from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  resolveBoundPixelRows,
  resolveEffectiveMetaRows,
} from "@/features/pixels/queries";
import type { PixelConnectionStatus } from "@/features/pixels/types";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v24.0";
const MAX_DELIVERY_ATTEMPTS = 3;

/** A Meta exige os dados do cliente com hash SHA-256 em minúsculas. */
function hashed(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Só dígitos, com código do país — nunca aplicar hash duas vezes. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Mesmo `event_id` usado pelo navegador (Pixel) e pelo servidor (CAPI) — condição obrigatória de dedupe. */
export function buildPurchaseEventId(orderId: string): string {
  return `purchase_${orderId}`;
}

export interface PurchaseAttribution {
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
}

export type PurchaseTriggerType =
  "generated_order" | "payment_approved" | "reprocess";

export interface PurchaseEventInput extends PurchaseAttribution {
  workspaceId: string;
  orderId: string;
  /** Landing page de origem — aplica o fallback específico > global dos pixels CAPI */
  landingPageId?: string | null;
  /** Link de pagamento de origem — aplica os vínculos explícitos do link. */
  paymentLinkId?: string | null;
  /** Identificador estável do evento — deduplica browser x servidor */
  eventId: string;
  triggerType: PurchaseTriggerType;
  valueCents: number;
  currency: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  externalId?: string | null;
  productName?: string | null;
  quantity?: number;
  /**
   * Identificadores do que foi comprado — SKU da variação quando existe.
   * É o que liga a conversão ao anúncio de catálogo certo (cor comprada,
   * não o produto genérico).
   */
  contentIds?: string[];
}

export function buildUserData(
  input: PurchaseEventInput,
): Record<string, string | string[]> {
  const userData: Record<string, string | string[]> = {};
  if (input.email) userData.em = [hashed(normalizeEmail(input.email))];
  if (input.phone) {
    const digits = normalizePhoneDigits(input.phone);
    if (digits) userData.ph = [hashed(digits)];
  }
  const hashedFields = {
    fn: input.firstName,
    ln: input.lastName,
    ct: input.city,
    st: input.state,
    zp: input.postalCode,
    country: input.country,
    external_id: input.externalId,
  };
  for (const [key, value] of Object.entries(hashedFields)) {
    if (value?.trim()) userData[key] = [hashed(value)];
  }
  // fbp/fbc/IP/user agent NUNCA levam hash — são identificadores de sessão,
  // não dados pessoais diretos.
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.ip) userData.client_ip_address = input.ip;
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  return userData;
}

export function buildCustomData(
  input: PurchaseEventInput,
): Record<string, unknown> {
  return {
    currency: input.currency,
    value: input.valueCents / 100,
    order_id: input.orderId,
    num_items: input.quantity ?? input.contentIds?.length ?? 1,
    ...(input.productName ? { content_name: input.productName } : {}),
    ...(input.contentIds && input.contentIds.length > 0
      ? { content_type: "product", content_ids: input.contentIds }
      : {}),
  };
}

interface MetaGraphResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

export function isRetryableMetaStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

async function callMetaGraph(
  pixelId: string,
  token: string,
  events: Record<string, unknown>[],
  testEventCode?: string,
): Promise<MetaGraphResult> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        data: events,
        ...(testEventCode ? { test_event_code: testEventCode } : {}),
      }),
    },
  );

  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { ok: response.ok, status: response.status, body };
}

/** Nunca ecoa token/segredo — defensivo, mesmo a Meta não devolvendo isso. */
function sanitizeResponse(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (/token|secret|authorization/i.test(key)) continue;
    clone[key] = value;
  }
  return clone;
}

async function deliverPurchase(
  pixel: typeof pixels.$inferSelect,
  eventRowId: string,
  input: PurchaseEventInput,
): Promise<void> {
  const db = getDb();
  try {
    const token = decryptSecret(pixel.encryptedToken!);
    const event = {
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: "website",
      ...(input.sourceUrl ? { event_source_url: input.sourceUrl } : {}),
      user_data: buildUserData(input),
      custom_data: buildCustomData(input),
    };
    let result: MetaGraphResult | null = null;

    for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
      await db
        .update(pixelEvents)
        .set({
          status: "processing",
          retryCount: attempt - 1,
          updatedAt: new Date(),
        })
        .where(eq(pixelEvents.id, eventRowId));

      try {
        result = await callMetaGraph(pixel.pixelId!, token, [event]);
      } catch {
        result = { ok: false, status: 0, body: {} };
      }

      const retryable = isRetryableMetaStatus(result.status);
      if (result.ok || !retryable || attempt === MAX_DELIVERY_ATTEMPTS) break;
      await new Promise((resolve) =>
        setTimeout(resolve, 250 * 4 ** (attempt - 1)),
      );
    }

    if (!result) throw new Error("delivery_not_started");
    const traceId =
      typeof result.body.fbtrace_id === "string"
        ? result.body.fbtrace_id
        : null;
    const errorObj = result.body.error as
      { message?: string; code?: number } | undefined;

    await db
      .update(pixelEvents)
      .set({
        status: result.ok ? "sent" : "failed",
        sentAt: result.ok ? new Date() : null,
        httpStatus: result.status,
        metaTraceId: traceId,
        response: sanitizeResponse(result.body),
        errorCode: errorObj?.code ? String(errorObj.code) : null,
        error: result.ok
          ? null
          : (errorObj?.message ?? "Falha temporária ao enviar à Meta").slice(
              0,
              500,
            ),
      })
      .where(eq(pixelEvents.id, eventRowId));

    if (result.ok) {
      await db
        .update(pixels)
        .set({ lastActivityAt: new Date() })
        .where(eq(pixels.id, pixel.id));
    }
  } catch {
    await db
      .update(pixelEvents)
      .set({
        status: "failed",
        error: "Falha interna ao preparar o evento para a Meta.",
        updatedAt: new Date(),
      })
      .where(eq(pixelEvents.id, eventRowId));
  }
}

/**
 * Envia o evento Purchase pela Conversions API da Meta a todos os pixels
 * `meta_capi` efetivos da landing page (fallback específico > global).
 *
 * Chamado a partir do checkout (quando a regra "generated" está ativa) e do
 * webhook de pagamento aprovado — nunca do navegador. Idempotente: o índice
 * único `(pixelId, eventId, channel)` garante no máximo 1 envio por pixel
 * por pedido, não importa quantas vezes esta função seja chamada para o
 * mesmo `eventId`.
 */
export async function sendPurchaseToMetaCapi(
  input: PurchaseEventInput,
): Promise<void> {
  const db = getDb();
  const pixelRows = input.paymentLinkId
    ? await resolveBoundPixelRows(
        input.workspaceId,
        { type: "payment_link", id: input.paymentLinkId },
        "meta_capi",
      )
    : await resolveEffectiveMetaRows(
        input.landingPageId ?? null,
        input.workspaceId,
      );

  const queued: {
    pixel: typeof pixels.$inferSelect;
    eventRowId: string;
  }[] = [];

  for (const pixel of pixelRows) {
    if (!pixel.pixelId || !pixel.encryptedToken || !pixel.isActive) continue;

    // Deduplicação: o mesmo evento nunca é enviado duas vezes ao mesmo pixel.
    const inserted = await db
      .insert(pixelEvents)
      .values({
        workspaceId: input.workspaceId,
        pixelId: pixel.id,
        landingPageId: input.landingPageId ?? null,
        eventName: "Purchase",
        eventId: input.eventId,
        channel: "server",
        orderId: input.orderId,
        triggerType: input.triggerType,
        status: "pending",
        payloadVersion: "v1",
      })
      .onConflictDoNothing()
      .returning({ id: pixelEvents.id });

    if (inserted.length === 0) continue;

    queued.push({ pixel, eventRowId: inserted[0].id });
  }

  if (queued.length > 0) {
    after(async () => {
      await Promise.allSettled(
        queued.map(({ pixel, eventRowId }) =>
          deliverPurchase(pixel, eventRowId, input),
        ),
      );
    });
  }
}

/** Reconstrói o input de Purchase a partir do pedido — usado no reprocessamento manual. */
async function rebuildPurchaseInput(
  orderId: string,
  landingPageId: string | null,
  eventId: string,
): Promise<PurchaseEventInput | null> {
  const db = getDb();
  const [orderRow] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!orderRow) return null;

  const [customerRow] = orderRow.customerId
    ? await db
        .select()
        .from(customers)
        .where(eq(customers.id, orderRow.customerId))
        .limit(1)
    : [undefined];

  const itemRows = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return {
    workspaceId: orderRow.workspaceId,
    orderId,
    landingPageId,
    eventId,
    triggerType: "reprocess",
    valueCents: orderRow.totalCents,
    currency: orderRow.currency,
    email: customerRow?.email,
    phone: customerRow?.phone,
    firstName: customerRow?.firstName,
    lastName: customerRow?.lastName,
    country: customerRow?.country,
    externalId: customerRow?.id,
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
  };
}

/**
 * Reprocessa manualmente um evento de CAPI que falhou (botão "Reprocessar"
 * do log). Atualiza o registro existente em vez de inserir um novo — nunca
 * duplica o evento já registrado.
 */
export async function reprocessPurchaseEvent(
  eventRowId: string,
): Promise<void> {
  const db = getDb();
  const [event] = await db
    .select()
    .from(pixelEvents)
    .where(eq(pixelEvents.id, eventRowId))
    .limit(1);

  if (
    !event ||
    event.status !== "failed" ||
    event.channel !== "server" ||
    !event.orderId
  ) {
    throw new Error("Este evento não pode ser reprocessado.");
  }

  const [pixel] = await db
    .select()
    .from(pixels)
    .where(eq(pixels.id, event.pixelId))
    .limit(1);
  if (!pixel || !pixel.pixelId || !pixel.encryptedToken) {
    throw new Error(
      "O pixel deste evento não está mais configurado corretamente.",
    );
  }

  const input = await rebuildPurchaseInput(
    event.orderId,
    event.landingPageId,
    event.eventId,
  );
  if (!input) throw new Error("Pedido original não encontrado.");

  await db
    .update(pixelEvents)
    .set({
      status: "pending",
      triggerType: "reprocess",
      retryCount: event.retryCount ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(pixelEvents.id, eventRowId));

  await deliverPurchase(pixel, eventRowId, input);
}

export interface TestConnectionResult {
  ok: boolean;
  status: PixelConnectionStatus;
  message: string;
}

/**
 * Testa a conexão de um pixel Meta: valida o Pixel ID + token no Graph API
 * e, se houver código de teste, envia um `PageView` marcado como teste (nunca
 * um `Purchase` de produção). O token é descriptografado só aqui e nunca
 * aparece no retorno.
 */
export async function testMetaConnection(
  pixelId: string,
  encryptedToken: string,
  testEventCode?: string | null,
): Promise<TestConnectionResult> {
  let token: string;
  try {
    token = decryptSecret(encryptedToken);
  } catch {
    return {
      ok: false,
      status: "invalid_token",
      message: "Token salvo em formato inválido — cadastre um novo token.",
    };
  }

  try {
    const infoResp = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}?fields=id,name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const infoBody = (await infoResp.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!infoResp.ok) {
      const err = infoBody.error as
        { code?: number; message?: string } | undefined;
      if (err?.code === 190) {
        return {
          ok: false,
          status: "invalid_token",
          message: "Token inválido ou expirado.",
        };
      }
      if (err?.code === 100 || err?.code === 803) {
        return {
          ok: false,
          status: "invalid_pixel",
          message: "Pixel ID não encontrado ou sem permissão de acesso.",
        };
      }
      return {
        ok: false,
        status: "connection_error",
        message: err?.message ?? "Não foi possível conectar com a Meta.",
      };
    }

    if (testEventCode) {
      await callMetaGraph(
        pixelId,
        token,
        [
          {
            event_name: "PageView",
            event_time: Math.floor(Date.now() / 1000),
            event_id: `test_${Date.now()}`,
            action_source: "website",
          },
        ],
        testEventCode,
      );
    }

    return { ok: true, status: "connected", message: "Conexão confirmada." };
  } catch {
    return {
      ok: false,
      status: "connection_error",
      message: "Erro de rede ao conectar com a Meta.",
    };
  }
}
