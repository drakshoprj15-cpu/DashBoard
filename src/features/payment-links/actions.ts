"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  domains,
  paymentLinks,
  pixelBindings,
  pixels,
} from "@/database/schema";
import { requireWorkspaceAccess } from "@/lib/workspace-access";
import { generatePaymentLinkSlug } from "@/features/payment-links/slug";
import {
  buildPaymentLinkUrl,
  countPaidPayments,
  getPaymentLinkById,
} from "@/features/payment-links/queries";
import {
  DEFAULT_PAYMENT_LINK_APPEARANCE,
  DEFAULT_PAYMENT_LINK_BRAND,
  type PublicPaymentLink,
} from "@/features/payment-links/types";
import {
  paymentLinkSchema,
  type PaymentLinkInput,
} from "@/validations/payment-link";
import {
  getWorkspacePaymentProvider,
  PaymentProviderNotConfiguredError,
} from "@/payment-providers/resolve";
import { validatePaymentLinkAssetUrls } from "@/features/payment-links/security";

const LIST_PATH = "/financeiro/links-de-pagamento";

export interface PaymentLinkActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  link?: { id: string; slug: string; url: string };
}

/**
 * Porta de entrada de toda action administrativa.
 *
 * Sessão + workspace resolvidos no servidor: o workspace NUNCA chega pelo
 * formulário, então não há como um cliente pedir para escrever no workspace
 * de outro.
 */
async function requireWorkspace(): Promise<
  { ok: true; workspaceId: string } | { ok: false; error: string }
> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }
  try {
    const { workspaceId } = await requireWorkspaceAccess([
      "owner",
      "admin",
      "finance",
      "marketing",
    ]);
    return { ok: true, workspaceId };
  } catch {
    return { ok: false, error: "Você não possui permissão para gerir links." };
  }
}

/** Data de expiração a partir da opção escolhida no formulário. */
function resolveExpiresAt(data: PaymentLinkInput): Date | null {
  const HOURS: Record<string, number> = {
    "1h": 1,
    "24h": 24,
    "3d": 72,
    "7d": 168,
  };

  if (data.expiration === "never") return null;
  if (data.expiration === "custom") {
    return data.expiresAt ? new Date(data.expiresAt) : null;
  }
  const hours = HOURS[data.expiration];
  return hours ? new Date(Date.now() + hours * 3_600_000) : null;
}

function resolveMaxPayments(data: PaymentLinkInput): number | null {
  if (data.usageLimit === "single") return 1;
  if (data.usageLimit === "custom") return data.maxPayments ?? null;
  return null;
}

/** Um slug livre no banco inteiro (o índice é global, não por workspace). */
async function ensureUniqueSlug(
  desired: string | undefined,
  ignoreId?: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const db = getDb();

  if (desired) {
    const [clash] = await db
      .select({ id: paymentLinks.id })
      .from(paymentLinks)
      .where(
        ignoreId
          ? and(eq(paymentLinks.slug, desired), ne(paymentLinks.id, ignoreId))
          : eq(paymentLinks.slug, desired),
      )
      .limit(1);

    if (clash) {
      return {
        ok: false,
        error: "Este endereço já está em uso. Escolha outro.",
      };
    }
    return { ok: true, slug: desired };
  }

  // Token aleatório: tentamos poucas vezes porque a colisão em 55 bits é
  // remota — se acontecer três vezes seguidas, algo está errado no banco.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generatePaymentLinkSlug();
    const [clash] = await db
      .select({ id: paymentLinks.id })
      .from(paymentLinks)
      .where(eq(paymentLinks.slug, candidate))
      .limit(1);
    if (!clash) return { ok: true, slug: candidate };
  }

  return { ok: false, error: "Não foi possível gerar o endereço do link." };
}

/** Campos gravados a partir do formulário, sem o slug (tratado à parte). */
function toColumns(data: PaymentLinkInput) {
  const snapshot = data.showProduct && data.product ? data.product : null;
  const fieldMode = (
    key: string,
    fallback: "required" | "optional" | "hidden",
  ) => data.customerFields.find((field) => field.key === key)?.mode ?? fallback;
  const requiresAddress = data.customerFields.some(
    (field) =>
      [
        "addressLine1",
        "addressLine2",
        "postalCode",
        "city",
        "region",
        "country",
      ].includes(field.key) && field.mode !== "hidden",
  );

  return {
    name: data.name,
    title: data.title,
    description: data.description || null,
    priceCents: data.amountCents,
    currency: data.currency,
    paymentMethods: data.paymentMethods,
    quantity: snapshot?.quantity ?? 1,
    productId: data.productId || null,
    productSnapshot: snapshot,
    requestName: fieldMode("firstName", data.requestName),
    requestEmail: fieldMode("email", data.requestEmail),
    requestPhone: fieldMode("phone", data.requestPhone),
    requiresAddress,
    requestShipping: data.requestShipping,
    shippingOptions: data.requestShipping ? data.shippingOptions : [],
    logoUrl: data.logoUrl || null,
    brandConfig: data.brand,
    appearanceConfig: data.appearance,
    customerFields: data.customerFields,
    successConfig: data.success,
    seoConfig: data.seo,
    buttonColor: data.appearance.buttonColor,
    buttonTextColor: data.appearance.buttonTextColor,
    borderColor: data.appearance.cardBorderColor,
    backgroundStyle: data.backgroundStyle,
    borderRadius: data.appearance.cardRadius,
    buttonText: data.buttonText,
    domainId: data.domainId || null,
    metaPixelEnabled: data.metaPixelEnabled,
    expiresAt: resolveExpiresAt(data),
    maxPayments: resolveMaxPayments(data),
  };
}

function toPublishedSnapshot(
  data: PaymentLinkInput,
  slug: string,
): PublicPaymentLink {
  const columns = toColumns(data);
  return {
    slug,
    title: data.title,
    description: data.description || null,
    amountCents: data.amountCents,
    currency: data.currency,
    product: data.showProduct && data.product ? data.product : null,
    paymentMethods: data.paymentMethods,
    brand: {
      ...DEFAULT_PAYMENT_LINK_BRAND,
      ...data.brand,
      logoUrl: data.logoUrl || null,
    },
    appearance: {
      ...DEFAULT_PAYMENT_LINK_APPEARANCE,
      ...data.appearance,
      backgroundStyle: data.backgroundStyle,
      borderColor: data.appearance.cardBorderColor,
      borderRadius: data.appearance.cardRadius,
      buttonText: data.buttonText,
    },
    fields: {
      requestName: columns.requestName,
      requestEmail: columns.requestEmail,
      requestPhone: columns.requestPhone,
      requiresAddress: columns.requiresAddress,
      requestShipping: data.requestShipping,
      shippingOptions: data.requestShipping ? data.shippingOptions : [],
      customerFields: data.customerFields,
    },
    success: data.success,
    seo: data.seo,
  };
}

async function validatePublishRequirements(
  data: PaymentLinkInput,
  workspaceId: string,
): Promise<string | null> {
  if (data.brand.companyName.trim().length < 2) {
    return "Informe o nome comercial legítimo da empresa antes de publicar.";
  }
  if (data.paymentMethods.length === 0) {
    return "Ative pelo menos um método de pagamento antes de publicar.";
  }

  if (data.domainId) {
    const [domain] = await getDb()
      .select({
        isVerified: domains.isVerified,
        isActive: domains.isActive,
      })
      .from(domains)
      .where(
        and(
          eq(domains.id, data.domainId),
          eq(domains.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!domain) return "O domínio selecionado não pertence a este workspace.";
    if (!domain.isVerified || !domain.isActive) {
      return "Verifique o DNS e o SSL do domínio antes de publicar neste endereço.";
    }
  }

  try {
    const { provider } = await getWorkspacePaymentProvider(workspaceId);
    const supported = await provider.listPaymentMethods({
      currency: data.currency,
      country: "PT",
    });
    const unsupported = data.paymentMethods.find(
      (method) => !supported.includes(method),
    );
    if (unsupported) {
      return "Um dos métodos escolhidos não é suportado pelo processador configurado.";
    }
  } catch (error) {
    if (error instanceof PaymentProviderNotConfiguredError) {
      return "Configure a conta Broski antes de publicar o link.";
    }
    throw error;
  }

  return null;
}

async function validatePixelSelection(
  pixelIds: string[],
  workspaceId: string,
): Promise<string | null> {
  if (pixelIds.length === 0) return null;
  const rows = await getDb()
    .select({ id: pixels.id })
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        eq(pixels.isActive, true),
        isNull(pixels.deletedAt),
        inArray(pixels.id, pixelIds),
      ),
    );
  return rows.length === new Set(pixelIds).size
    ? null
    : "Uma das integrações de conversão selecionadas não está disponível.";
}

async function syncPixelBindings(
  workspaceId: string,
  linkId: string,
  pixelIds: string[],
) {
  await getDb().transaction(async (tx) => {
    await tx
      .delete(pixelBindings)
      .where(
        and(
          eq(pixelBindings.workspaceId, workspaceId),
          eq(pixelBindings.targetType, "payment_link"),
          eq(pixelBindings.targetId, linkId),
        ),
      );
    if (pixelIds.length > 0) {
      await tx.insert(pixelBindings).values(
        [...new Set(pixelIds)].map((pixelId) => ({
          workspaceId,
          pixelId,
          targetType: "payment_link",
          targetId: linkId,
        })),
      );
    }
  });
}

export async function savePaymentLinkAction(
  payload: unknown,
  linkId?: string,
  intent: "draft" | "publish" = "draft",
): Promise<PaymentLinkActionResult> {
  const parsed = paymentLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const auth = await requireWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  const data = parsed.data;
  const assetError = validatePaymentLinkAssetUrls({
    logoUrl: data.logoUrl,
    faviconUrl: data.brand.faviconUrl,
    seoFaviconUrl: data.seo.faviconUrl,
    productImageUrl: data.product?.imageUrl,
  });
  if (assetError) return { ok: false, error: assetError };
  const pixelError = await validatePixelSelection(
    data.pixelIds,
    auth.workspaceId,
  );
  if (pixelError) return { ok: false, error: pixelError };

  if (intent === "publish") {
    const publishError = await validatePublishRequirements(
      data,
      auth.workspaceId,
    );
    if (publishError) return { ok: false, error: publishError };
  }

  try {
    if (linkId) {
      // Confere a posse ANTES de escrever: `getPaymentLinkById` já filtra
      // pelo workspace da sessão.
      const existing = await getPaymentLinkById(linkId);
      if (!existing) {
        return { ok: false, error: "Link não encontrado." };
      }

      const slug = await ensureUniqueSlug(data.slug || undefined, linkId);
      if (!slug.ok) return { ok: false, error: slug.error };
      const nextSlug = data.slug ? slug.slug : existing.slug;
      const publishing = intent === "publish";

      await db
        .update(paymentLinks)
        .set({
          ...toColumns(data),
          slug: nextSlug,
          ...(publishing
            ? {
                status: "published" as const,
                isActive: true,
                archivedAt: null,
                publishedAt: new Date(),
                publishedSnapshot: toPublishedSnapshot(data, nextSlug),
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentLinks.id, linkId),
            eq(paymentLinks.workspaceId, auth.workspaceId),
          ),
        );
      await syncPixelBindings(auth.workspaceId, linkId, data.pixelIds);

      const updated = await getPaymentLinkById(linkId);
      revalidatePath(LIST_PATH);

      return {
        ok: true,
        message: publishing ? "Link publicado." : "Rascunho guardado.",
        link: updated
          ? {
              id: updated.id,
              slug: updated.slug,
              url: buildPaymentLinkUrl(updated.slug, updated.domainHostname),
            }
          : undefined,
      };
    }

    const slug = await ensureUniqueSlug(data.slug || undefined);
    if (!slug.ok) return { ok: false, error: slug.error };
    const publishing = intent === "publish";

    const [created] = await db
      .insert(paymentLinks)
      .values({
        workspaceId: auth.workspaceId,
        slug: slug.slug,
        ...toColumns(data),
        status: publishing ? "published" : "draft",
        isActive: publishing,
        publishedAt: publishing ? new Date() : null,
        publishedSnapshot: publishing
          ? toPublishedSnapshot(data, slug.slug)
          : null,
      })
      .returning({ id: paymentLinks.id, slug: paymentLinks.slug });

    const record = await getPaymentLinkById(created.id);
    await syncPixelBindings(auth.workspaceId, created.id, data.pixelIds);
    revalidatePath(LIST_PATH);

    return {
      ok: true,
      message: publishing ? "Link publicado." : "Rascunho criado.",
      link: {
        id: created.id,
        slug: created.slug,
        url: buildPaymentLinkUrl(created.slug, record?.domainHostname ?? null),
      },
    };
  } catch (error) {
    console.error("[payment-links] falha ao gravar link:", error);
    return { ok: false, error: "Não foi possível guardar o link." };
  }
}

export async function togglePaymentLinkAction(
  linkId: string,
  isActive: boolean,
): Promise<PaymentLinkActionResult> {
  const auth = await requireWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const existing = await getPaymentLinkById(linkId);
    if (!existing) return { ok: false, error: "Link não encontrado." };

    if (isActive) {
      if (!existing.publishedSnapshot) {
        return {
          ok: false,
          error: "Abra o editor e publique o rascunho antes de ativar o link.",
        };
      }
      try {
        const { provider } = await getWorkspacePaymentProvider(
          auth.workspaceId,
        );
        const supported = await provider.listPaymentMethods({
          currency: existing.currency,
          country: "PT",
        });
        if (
          existing.publishedSnapshot.paymentMethods.some(
            (method) => !supported.includes(method),
          )
        ) {
          return {
            ok: false,
            error:
              "O processador atual não suporta todos os métodos publicados.",
          };
        }
      } catch (error) {
        if (error instanceof PaymentProviderNotConfiguredError) {
          return {
            ok: false,
            error: "Configure a conta Broski antes de reativar.",
          };
        }
        throw error;
      }
      if (existing.domainId) {
        const [domain] = await getDb()
          .select({
            isVerified: domains.isVerified,
            isActive: domains.isActive,
          })
          .from(domains)
          .where(
            and(
              eq(domains.id, existing.domainId),
              eq(domains.workspaceId, auth.workspaceId),
            ),
          )
          .limit(1);
        if (!domain?.isVerified || !domain.isActive) {
          return {
            ok: false,
            error: "Verifique o domínio novamente antes de reativar.",
          };
        }
      }
    }

    await getDb()
      .update(paymentLinks)
      .set({
        isActive,
        status: isActive ? "published" : "unpublished",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentLinks.id, linkId),
          eq(paymentLinks.workspaceId, auth.workspaceId),
        ),
      );

    revalidatePath(LIST_PATH);
    return {
      ok: true,
      message: isActive ? "Link reativado." : "Link pausado.",
    };
  } catch (error) {
    console.error("[payment-links] falha ao alternar link:", error);
    return { ok: false, error: "Não foi possível alterar o estado do link." };
  }
}

export async function archivePaymentLinkAction(
  linkId: string,
  archived: boolean,
): Promise<PaymentLinkActionResult> {
  const auth = await requireWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    await getDb()
      .update(paymentLinks)
      .set({
        archivedAt: archived ? new Date() : null,
        status: archived ? "archived" : "unpublished",
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentLinks.id, linkId),
          eq(paymentLinks.workspaceId, auth.workspaceId),
        ),
      );

    revalidatePath(LIST_PATH);
    return {
      ok: true,
      message: archived ? "Link arquivado." : "Link restaurado.",
    };
  } catch (error) {
    console.error("[payment-links] falha ao arquivar link:", error);
    return { ok: false, error: "Não foi possível arquivar o link." };
  }
}

/**
 * Exclusão é soft delete.
 *
 * Um link com pagamentos confirmados nunca é removido: os pedidos apontam
 * para ele, e apagar a linha deixaria receita órfã no Financeiro. Nesse caso
 * a resposta orienta a arquivar.
 */
export async function deletePaymentLinkAction(
  linkId: string,
): Promise<PaymentLinkActionResult> {
  const auth = await requireWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const existing = await getPaymentLinkById(linkId);
    if (!existing) return { ok: false, error: "Link não encontrado." };

    const paid = await countPaidPayments(linkId);
    if (paid > 0) {
      return {
        ok: false,
        error:
          "Este link já recebeu pagamentos e não pode ser excluído. Arquive-o para o tirar da lista.",
      };
    }

    await getDb()
      .update(paymentLinks)
      .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(paymentLinks.id, linkId),
          eq(paymentLinks.workspaceId, auth.workspaceId),
          isNull(paymentLinks.deletedAt),
        ),
      );

    revalidatePath(LIST_PATH);
    return { ok: true, message: "Link excluído." };
  } catch (error) {
    console.error("[payment-links] falha ao excluir link:", error);
    return { ok: false, error: "Não foi possível excluir o link." };
  }
}

/** Cria uma cópia desativada do link, com endereço novo. */
export async function duplicatePaymentLinkAction(
  linkId: string,
): Promise<PaymentLinkActionResult> {
  const auth = await requireWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const source = await getPaymentLinkById(linkId);
    if (!source) return { ok: false, error: "Link não encontrado." };

    const slug = await ensureUniqueSlug(undefined);
    if (!slug.ok) return { ok: false, error: slug.error };

    const [created] = await getDb()
      .insert(paymentLinks)
      .values({
        workspaceId: auth.workspaceId,
        slug: slug.slug,
        name: `${source.name || source.title} (cópia)`,
        title: source.title,
        description: source.description,
        priceCents: source.amountCents,
        currency: source.currency,
        status: "draft",
        paymentMethods: source.paymentMethods,
        quantity: source.quantity,
        productId: source.productId,
        productSnapshot: source.productSnapshot,
        requestName: source.requestName,
        requestEmail: source.requestEmail,
        requestPhone: source.requestPhone,
        requiresAddress: source.requiresAddress,
        requestShipping: source.requestShipping,
        shippingOptions: source.shippingOptions,
        logoUrl: source.logoUrl,
        brandConfig: source.brandConfig,
        appearanceConfig: source.appearanceConfig,
        customerFields: source.customerFields,
        successConfig: source.successConfig,
        seoConfig: source.seoConfig,
        buttonColor: source.buttonColor,
        buttonTextColor: source.buttonTextColor,
        borderColor: source.borderColor,
        backgroundStyle: source.backgroundStyle,
        borderRadius: source.borderRadius,
        buttonText: source.buttonText,
        domainId: source.domainId,
        metaPixelEnabled: source.metaPixelEnabled,
        expiresAt: source.expiresAt,
        maxPayments: source.maxPayments,
        // A cópia nasce desativada: quem duplicou ainda vai ajustar algo.
        isActive: false,
        publishedSnapshot: null,
        publishedAt: null,
      })
      .returning({ id: paymentLinks.id, slug: paymentLinks.slug });

    const sourceBindings = await getDb()
      .select({ pixelId: pixelBindings.pixelId })
      .from(pixelBindings)
      .where(
        and(
          eq(pixelBindings.workspaceId, auth.workspaceId),
          eq(pixelBindings.targetType, "payment_link"),
          eq(pixelBindings.targetId, source.id),
        ),
      );
    await syncPixelBindings(
      auth.workspaceId,
      created.id,
      sourceBindings.map((binding) => binding.pixelId),
    );

    revalidatePath(LIST_PATH);
    return {
      ok: true,
      message: "Cópia criada (desativada).",
      link: {
        id: created.id,
        slug: created.slug,
        url: buildPaymentLinkUrl(created.slug, source.domainHostname),
      },
    };
  } catch (error) {
    console.error("[payment-links] falha ao duplicar link:", error);
    return { ok: false, error: "Não foi possível duplicar o link." };
  }
}
