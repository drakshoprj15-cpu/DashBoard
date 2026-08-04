"use server";

import { checkoutSchema, normalizePtPhone } from "@/validations/checkout";
import { getProductBySlug } from "@/features/landing/queries";
import {
  calculateShippingCost,
  listActiveShippingMethods,
} from "@/features/shipping/queries";
import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  customers,
  orderItems,
  orders,
  payments,
  products,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getRequestUrl } from "@/lib/request-url";
import {
  createBroskiProvider,
  BroskiApiError,
} from "@/payment-providers/broski";
import { createNotification } from "@/features/notifications/create";
import { pushEvent } from "@/features/notifications/pushcut";
import {
  resolveVariantForPurchase,
  type VariantResolution,
} from "@/features/variants/resolve";
import { formatMoney } from "@/lib/format";
import { and, eq } from "drizzle-orm";

export type CheckoutActionResult =
  | { status: "validation_error"; error: string }
  | { status: "unavailable"; message: string }
  | { status: "payment_error"; error: string }
  | {
      status: "payment_created";
      method: "mbway" | "multibanco";
      orderReference: string;
      totalCents: number;
      /** MB WAY: telemóvel que receberá a notificação */
      mbwayPhone?: string;
      /** Multibanco: voucher para exibir ao cliente */
      multibanco?: {
        entity: string;
        reference: string;
        amountCents: number;
      };
    };

function generateOrderReference(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `IN-${stamp}${rand}`;
}

/**
 * Fluxo real do checkout (Broski + Supabase):
 * 1. Valida os dados (Zod, servidor)
 * 2. Cria/atualiza o cliente e registra pedido + itens no banco
 * 3. Cria o pagamento no Broski (idempotente, EUR, MB WAY/Multibanco)
 * 4. MB WAY → cliente confirma no telemóvel; Multibanco → voucher na tela
 * 5. A liberação definitiva acontece só no webhook order.paid
 */
export async function submitCheckoutAction(
  _prev: CheckoutActionResult | null,
  formData: FormData,
): Promise<CheckoutActionResult> {
  const parsed = checkoutSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") ?? "",
    postalCode: formData.get("postalCode"),
    city: formData.get("city"),
    paymentMethod: formData.get("paymentMethod"),
    quantity: formData.get("quantity"),
    productSlug: formData.get("productSlug"),
    variantId: formData.get("variantId") ?? "",
    shippingMethodId: formData.get("shippingMethodId") ?? "",
    utmSource: formData.get("utmSource") ?? "",
    utmMedium: formData.get("utmMedium") ?? "",
    utmCampaign: formData.get("utmCampaign") ?? "",
    utmContent: formData.get("utmContent") ?? "",
    utmTerm: formData.get("utmTerm") ?? "",
    landingPageId: formData.get("landingPageId") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "validation_error",
      error: parsed.error.issues[0].message,
    };
  }

  const data = parsed.data;
  // Telefone chega ao gateway sempre no formato internacional.
  const phone = data.phone ? normalizePtPhone(data.phone) : undefined;
  const product = await getProductBySlug(data.productSlug);

  if (!product || product.slug !== data.productSlug) {
    return { status: "validation_error", error: "Produto não encontrado." };
  }

  if (!process.env.BROSKI_API_KEY || !isDatabaseConfigured()) {
    return {
      status: "unavailable",
      message:
        "O pagamento ainda não pode ser processado: faltam credenciais do banco de dados ou do gateway. Nenhum valor foi cobrado.",
    };
  }

  // Variação: o navegador manda no máximo o identificador público. Preço,
  // estoque e estado são relidos do banco — um preço adulterado no formulário
  // não tem por onde entrar, porque nem sequer é lido.
  const workspaceIdForProduct = await getOrCreateDefaultWorkspace();
  const [productRowForVariant] = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.workspaceId, workspaceIdForProduct),
        eq(products.slug, product.slug),
      ),
    )
    .limit(1);

  const resolution: VariantResolution = productRowForVariant
    ? await resolveVariantForPurchase({
        productId: productRowForVariant.id,
        productPriceCents: product.priceCents,
        publicId: data.variantId || null,
        quantity: data.quantity,
      })
    : { kind: "no_variants" };

  if (resolution.kind === "not_found") {
    return {
      status: "validation_error",
      error: "Escolha uma opção disponível do produto antes de continuar.",
    };
  }
  if (resolution.kind === "not_purchasable") {
    return {
      status: "validation_error",
      error: `A opção "${resolution.variant.label}" está indisponível. Escolha outra.`,
    };
  }
  if (resolution.kind === "insufficient_stock") {
    return {
      status: "validation_error",
      error: `Restam apenas ${resolution.variant.stockQuantity} unidade(s) de "${resolution.variant.label}".`,
    };
  }

  const chosenVariant = resolution.kind === "ok" ? resolution.variant : null;
  const unitPriceCents = chosenVariant?.priceCents ?? product.priceCents;
  const subtotal = unitPriceCents * data.quantity;

  // Frete: NUNCA confiar no valor calculado no navegador — recalcula a
  // partir dos métodos ativos gravados no banco.
  const activeShippingMethods = await listActiveShippingMethods();
  const selectedShippingMethod = data.shippingMethodId
    ? activeShippingMethods.find((m) => m.id === data.shippingMethodId)
    : activeShippingMethods[0];

  if (activeShippingMethods.length > 0 && !selectedShippingMethod) {
    return {
      status: "validation_error",
      error: "Escolha uma forma de envio válida.",
    };
  }

  const shipping = selectedShippingMethod
    ? calculateShippingCost(selectedShippingMethod, subtotal)
    : 0;
  const total = subtotal + shipping;

  // Só guarda as chaves realmente preenchidas — nunca um objeto com strings
  // vazias, que poluiria a leitura de "pedido sem origem de campanha".
  const utm: Record<string, string> = {};
  if (data.utmSource) utm.utm_source = data.utmSource;
  if (data.utmMedium) utm.utm_medium = data.utmMedium;
  if (data.utmCampaign) utm.utm_campaign = data.utmCampaign;
  if (data.utmContent) utm.utm_content = data.utmContent;
  if (data.utmTerm) utm.utm_term = data.utmTerm;
  // `lp` liga o pedido à landing page que o originou — é assim que a aba
  // Métricas conta conversões reais, sem depender de pixel do navegador.
  if (data.landingPageId) utm.lp = data.landingPageId;

  const db = getDb();

  try {
    const workspaceId = await getOrCreateDefaultWorkspace();

    // Cliente: upsert por e-mail dentro do workspace
    const existingCustomer = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.workspaceId, workspaceId),
          eq(customers.email, data.email),
        ),
      )
      .limit(1);

    let customerId: string;
    if (existingCustomer.length > 0) {
      customerId = existingCustomer[0].id;
      await db
        .update(customers)
        .set({
          firstName: data.firstName,
          lastName: data.lastName,
          phone,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId));
    } else {
      const [created] = await db
        .insert(customers)
        .values({
          workspaceId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          phone,
          country: "PT",
        })
        .returning({ id: customers.id });
      customerId = created.id;
    }

    const shippingAddress = {
      line1: data.addressLine1,
      line2: data.addressLine2 || undefined,
      postal_code: data.postalCode,
      city: data.city,
      country: "PT",
    };

    const reference = generateOrderReference();

    const [productRow] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          eq(products.slug, product.slug),
        ),
      )
      .limit(1);

    const [order] = await db
      .insert(orders)
      .values({
        workspaceId,
        reference,
        customerId,
        status: "created",
        currency: "EUR",
        subtotalCents: subtotal,
        shippingCents: shipping,
        totalCents: total,
        shippingAddress,
        shippingMethod: selectedShippingMethod?.name,
        origin: data.landingPageId ? "landing_page" : "checkout",
        countryCode: "PT",
        utm,
      })
      .returning({ id: orders.id });

    // Cópia congelada: nome, opções, SKU, imagem e preço como estavam agora.
    // Editar a variação amanhã não altera o que este cliente comprou.
    await db.insert(orderItems).values({
      workspaceId,
      orderId: order.id,
      productId: productRow?.id,
      variantId: chosenVariant?.id ?? null,
      productName: product.name,
      variantName: chosenVariant?.label ?? null,
      variantOptions: chosenVariant?.options ?? null,
      sku: chosenVariant?.sku ?? null,
      imageUrl: chosenVariant?.imageUrl ?? product.mainImage ?? null,
      currency: "EUR",
      quantity: data.quantity,
      unitPriceCents,
      totalCents: subtotal,
    });

    // Pagamento no Broski (idempotência pela id do pedido)
    const provider = createBroskiProvider({
      environment: "production",
      apiKey: process.env.BROSKI_API_KEY,
      webhookSecret: process.env.BROSKI_WEBHOOK_SECRET,
    });

    // Domínio pelo qual o cliente chegou — com domínio próprio da loja, o
    // retorno do pagamento não pode cair no endereço do painel.
    const appUrl = await getRequestUrl();

    const result = await provider.createPayment({
      idempotencyKey: order.id,
      orderId: reference,
      amountCents: total,
      currency: "EUR",
      method: data.paymentMethod,
      customer: {
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        phone,
        address: {
          line1: data.addressLine1,
          line2: data.addressLine2 || undefined,
          postalCode: data.postalCode,
          city: data.city,
          country: "PT",
        },
      },
      successUrl: `${appUrl}/checkout/${product.slug}`,
      metadata: {
        description: (chosenVariant
          ? `${product.name} — ${chosenVariant.label}`
          : product.name
        ).slice(0, 140),
        checkoutUrl: `${appUrl}/checkout/${product.slug}`,
        productType: "physical",
      },
    });

    await db.insert(payments).values({
      workspaceId,
      orderId: order.id,
      externalId: result.externalId,
      status: result.status,
      method: data.paymentMethod,
      amountCents: total,
      currency: "EUR",
      idempotencyKey: order.id,
      metadata: { provider: "broski" },
    });

    await db
      .update(orders)
      .set({ status: "awaiting_payment", updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // "Venda gerada": o pedido existe e o pagamento foi iniciado, mas ainda
    // não está confirmado. A confirmação vem só pelo webhook. Falha aqui
    // nunca pode derrubar um pagamento já criado no gateway — daí o try.
    try {
      const amount = formatMoney(total, "EUR", "pt-PT");
      const detail = `Pedido ${reference} · ${data.email} · ${
        data.paymentMethod === "mbway" ? "MB WAY" : "Multibanco"
      }`;

      await createNotification({
        workspaceId,
        eventType: "order_created",
        title: "Venda gerada",
        body: detail,
        href: "/pedidos",
        valueCents: total,
        metadata: { orderId: order.id, reference },
      });

      await pushEvent("order_created", `Venda gerada · ${amount}`, detail);
    } catch (error) {
      console.error("[checkout] falha ao notificar venda gerada:", error);
    }

    return {
      status: "payment_created",
      method: data.paymentMethod,
      orderReference: reference,
      totalCents: total,
      mbwayPhone: data.paymentMethod === "mbway" ? phone : undefined,
      multibanco:
        data.paymentMethod === "multibanco" &&
        result.displayData?.multibancoEntity &&
        result.displayData?.multibancoReference
          ? {
              entity: result.displayData.multibancoEntity,
              reference: result.displayData.multibancoReference,
              amountCents: total,
            }
          : undefined,
    };
  } catch (error) {
    console.error("[checkout] erro ao processar pagamento:", error);
    if (error instanceof BroskiApiError) {
      return {
        status: "payment_error",
        error: `O gateway recusou a operação: ${error.message}`,
      };
    }
    return {
      status: "payment_error",
      error:
        "Não foi possível iniciar o pagamento. Nenhum valor foi cobrado — tente novamente em instantes.",
    };
  }
}
