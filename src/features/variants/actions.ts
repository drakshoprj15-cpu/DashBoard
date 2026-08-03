"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  orderItems,
  productOptionValues,
  productOptions,
  productVariantMedia,
  productVariantValues,
  productVariants,
  products,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/features/audit/log";
import {
  bulkActionSchema,
  reorderVariantsSchema,
  saveOptionsSchema,
  saveVariantSchema,
  variantIdSchema,
  type BulkActionFormInput,
  type SaveOptionsFormInput,
  type SaveVariantFormInput,
  type VariantInput,
} from "@/validations/product-variants";

import {
  buildOptionsKey,
  buildPublicId,
  buildVariantName,
  cartesian,
  suggestSku,
  uniquePublicId,
} from "./pricing";

export interface VariantActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const NO_DB: VariantActionResult = {
  ok: false,
  error:
    "Banco de dados não configurado. Ligue o Supabase para usar variações.",
};

const NO_SESSION: VariantActionResult = {
  ok: false,
  error: "Sessão expirada. Entre novamente para editar as variações.",
};

/**
 * Toda ação começa por aqui: sem sessão válida nada é escrito, e o
 * `workspaceId` resolvido é o filtro de propriedade — nenhuma consulta
 * abaixo toca numa linha de outro workspace.
 */
async function requireWorkspace(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return getOrCreateDefaultWorkspace();
}

/** O produto existe e pertence a este workspace? */
async function loadOwnedProduct(productId: string, workspaceId: string) {
  const db = getDb();
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      sku: products.sku,
      priceCents: products.priceCents,
    })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, workspaceId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);

  return product ?? null;
}

function revalidateProduct(productId: string, slug?: string) {
  revalidatePath("/catalogo/produtos");
  revalidatePath(`/catalogo/produtos/${productId}`);
  revalidatePath("/catalogo/estoque");
  revalidatePath("/landing-pages");
  if (slug) revalidatePath(`/p/${slug}`);
}

/** Identificadores públicos já usados no produto (para não repetir). */
async function takenPublicIds(
  productId: string,
  ignoreVariantId?: string,
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ publicId: productVariants.publicId, id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  return new Set(
    rows
      .filter((row) => row.id !== ignoreVariantId && row.publicId)
      .map((row) => row.publicId as string),
  );
}

// ---------------------------------------------------------------------------
// Atributos e valores
// ---------------------------------------------------------------------------

/**
 * Grava os atributos do produto (Cor, Tamanho…) e os seus valores.
 *
 * Um valor removido no editor só é apagado quando nenhuma variação o usa —
 * caso contrário a variação ficaria órfã de opção. Nesse caso a ação avisa
 * e mantém o valor, sugerindo desativar a variação primeiro.
 */
export async function saveProductOptionsAction(
  input: SaveOptionsFormInput,
): Promise<VariantActionResult> {
  const parsed = saveOptionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const data = parsed.data;
  const product = await loadOwnedProduct(data.productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();

  try {
    let blockedValues = 0;

    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ hasVariants: data.hasVariants, updatedAt: new Date() })
        .where(eq(products.id, data.productId));

      const existingOptions = await tx
        .select({ id: productOptions.id })
        .from(productOptions)
        .where(eq(productOptions.productId, data.productId));

      const keptOptionIds = new Set<string>();

      for (const [index, option] of data.options.entries()) {
        let optionId = option.id;

        if (optionId && existingOptions.some((row) => row.id === optionId)) {
          await tx
            .update(productOptions)
            .set({ name: option.name, position: index, updatedAt: new Date() })
            .where(eq(productOptions.id, optionId));
        } else {
          const [created] = await tx
            .insert(productOptions)
            .values({
              workspaceId,
              productId: data.productId,
              name: option.name,
              position: index,
            })
            .returning({ id: productOptions.id });
          optionId = created.id;
        }
        keptOptionIds.add(optionId);

        const existingValues = await tx
          .select({ id: productOptionValues.id })
          .from(productOptionValues)
          .where(eq(productOptionValues.optionId, optionId));

        const keptValueIds = new Set<string>();

        for (const [valueIndex, value] of option.values.entries()) {
          if (value.id && existingValues.some((row) => row.id === value.id)) {
            await tx
              .update(productOptionValues)
              .set({
                value: value.value,
                label: value.label,
                hexColor: value.hexColor,
                thumbnailUrl: value.thumbnailUrl,
                position: valueIndex,
                updatedAt: new Date(),
              })
              .where(eq(productOptionValues.id, value.id));
            keptValueIds.add(value.id);
          } else {
            const [created] = await tx
              .insert(productOptionValues)
              .values({
                workspaceId,
                optionId,
                value: value.value,
                label: value.label,
                hexColor: value.hexColor,
                thumbnailUrl: value.thumbnailUrl,
                position: valueIndex,
              })
              .returning({ id: productOptionValues.id });
            keptValueIds.add(created.id);
          }
        }

        // Valores retirados do editor: só somem se nenhuma variação os usar.
        const removedValueIds = existingValues
          .map((row) => row.id)
          .filter((id) => !keptValueIds.has(id));

        for (const valueId of removedValueIds) {
          const [inUse] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(productVariantValues)
            .where(eq(productVariantValues.optionValueId, valueId));

          if ((inUse?.total ?? 0) > 0) {
            blockedValues += 1;
            continue;
          }
          await tx
            .delete(productOptionValues)
            .where(eq(productOptionValues.id, valueId));
        }
      }

      // Atributos retirados: idem — só somem sem variação a usá-los.
      for (const option of existingOptions) {
        if (keptOptionIds.has(option.id)) continue;

        const [inUse] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(productVariantValues)
          .where(eq(productVariantValues.optionId, option.id));

        if ((inUse?.total ?? 0) > 0) {
          blockedValues += 1;
          continue;
        }
        await tx.delete(productOptions).where(eq(productOptions.id, option.id));
      }
    });

    await recordAuditLog({
      action: "product.options_updated",
      entityType: "product",
      entityId: data.productId,
      changes: {
        hasVariants: data.hasVariants,
        options: data.options.map((option) => option.name),
      },
    });

    revalidateProduct(data.productId, product.slug);

    return {
      ok: true,
      message: blockedValues
        ? `Opções salvas. ${blockedValues} valor(es) não foram removidos porque há variações a usá-los — exclua as variações primeiro.`
        : "Opções salvas.",
    };
  } catch (error) {
    console.error("[variants] erro ao salvar opções:", error);
    return { ok: false, error: "Não foi possível salvar as opções." };
  }
}

// ---------------------------------------------------------------------------
// Matriz de combinações
// ---------------------------------------------------------------------------

/**
 * Gera as combinações que ainda não existem (Preto+P, Preto+M, …).
 *
 * Nunca duplica: a chave normalizada da combinação é comparada com a das
 * variações já gravadas, e o índice único do banco é a segunda barreira.
 */
export async function generateVariantMatrixAction(input: {
  productId: string;
}): Promise<VariantActionResult> {
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const product = await loadOwnedProduct(input.productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();

  const options = await db
    .select({
      id: productOptions.id,
      name: productOptions.name,
      position: productOptions.position,
    })
    .from(productOptions)
    .where(eq(productOptions.productId, input.productId))
    .orderBy(asc(productOptions.position));

  if (options.length === 0) {
    return {
      ok: false,
      error: "Crie pelo menos um atributo (ex.: Cor) antes.",
    };
  }

  const values = await db
    .select({
      id: productOptionValues.id,
      optionId: productOptionValues.optionId,
      value: productOptionValues.value,
      hexColor: productOptionValues.hexColor,
      thumbnailUrl: productOptionValues.thumbnailUrl,
      position: productOptionValues.position,
    })
    .from(productOptionValues)
    .innerJoin(
      productOptions,
      eq(productOptions.id, productOptionValues.optionId),
    )
    .where(eq(productOptions.productId, input.productId))
    .orderBy(asc(productOptionValues.position));

  const lists = options.map((option) => ({
    option,
    values: values.filter((value) => value.optionId === option.id),
  }));

  if (lists.some((entry) => entry.values.length === 0)) {
    return {
      ok: false,
      error:
        "Cada atributo precisa de pelo menos um valor para gerar a matriz.",
    };
  }

  const combos = cartesian(
    lists.map((entry) =>
      entry.values.map((value) => ({ option: entry.option, value })),
    ),
  );

  if (combos.length > 200) {
    return {
      ok: false,
      error: `A matriz geraria ${combos.length} variações. Reduza os valores — o limite é 200.`,
    };
  }

  const existing = await db
    .select({
      id: productVariants.id,
      optionsKey: productVariants.optionsKey,
      isDefault: productVariants.isDefault,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, input.productId),
        isNull(productVariants.archivedAt),
      ),
    );

  const existingKeys = new Set(
    existing.map((row) => row.optionsKey).filter(Boolean) as string[],
  );
  const taken = await takenPublicIds(input.productId);
  let hasDefault = existing.some((row) => row.isDefault);
  let created = 0;

  try {
    await db.transaction(async (tx) => {
      for (const [index, combo] of combos.entries()) {
        const pairs = combo.map((entry) => ({
          optionName: entry.option.name,
          value: entry.value.value,
        }));
        const optionsKey = buildOptionsKey(pairs);
        if (existingKeys.has(optionsKey)) continue;
        existingKeys.add(optionsKey);

        const name = buildVariantName(pairs);
        const publicId = uniquePublicId(buildPublicId(pairs, name), taken);
        taken.add(publicId);

        const colorEntry = combo.find((entry) => entry.value.hexColor);
        const thumbEntry = combo.find((entry) => entry.value.thumbnailUrl);

        const [variant] = await tx
          .insert(productVariants)
          .values({
            workspaceId,
            productId: input.productId,
            name,
            publicId,
            optionsKey,
            sku: suggestSku(
              product.sku ?? product.slug,
              pairs.map((p) => p.value),
            ),
            // Preço herda o do produto — o administrador ajusta cor a cor
            // logo em seguida. Nunca inventamos um valor promocional.
            priceCents: product.priceCents,
            stockQuantity: 0,
            trackInventory: true,
            status: "active",
            isDefault: !hasDefault,
            position: existing.length + index,
            hexColor: colorEntry?.value.hexColor ?? null,
            thumbnailUrl: thumbEntry?.value.thumbnailUrl ?? null,
            attributes: Object.fromEntries(
              pairs.map((pair) => [pair.optionName, pair.value]),
            ),
          })
          .returning({ id: productVariants.id });

        hasDefault = true;
        created += 1;

        await tx.insert(productVariantValues).values(
          combo.map((entry) => ({
            workspaceId,
            variantId: variant.id,
            optionId: entry.option.id,
            optionValueId: entry.value.id,
          })),
        );
      }
    });
  } catch (error) {
    console.error("[variants] erro ao gerar matriz:", error);
    return { ok: false, error: "Não foi possível gerar as combinações." };
  }

  await recordAuditLog({
    action: "product.variants_generated",
    entityType: "product",
    entityId: input.productId,
    changes: { created },
  });

  revalidateProduct(input.productId, product.slug);

  return {
    ok: true,
    message: created
      ? `${created} variação(ões) criada(s). Ajuste preço, estoque e fotos de cada uma.`
      : "Todas as combinações já existem.",
  };
}

// ---------------------------------------------------------------------------
// Uma variação
// ---------------------------------------------------------------------------

/** Grava a galeria da variação substituindo a anterior. */
async function replaceVariantMedia(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  workspaceId: string,
  variantId: string,
  gallery: (string | null)[],
) {
  await tx
    .delete(productVariantMedia)
    .where(eq(productVariantMedia.variantId, variantId));

  const urls = gallery.filter((url): url is string => Boolean(url));
  if (urls.length === 0) return;

  await tx.insert(productVariantMedia).values(
    urls.map((url, index) => ({
      workspaceId,
      variantId,
      url,
      position: index,
      isPrimary: index === 0,
    })),
  );
}

function dimensionsOf(variant: VariantInput) {
  if (
    variant.lengthCm === null &&
    variant.widthCm === null &&
    variant.heightCm === null
  ) {
    return null;
  }
  return {
    lengthCm: variant.lengthCm,
    widthCm: variant.widthCm,
    heightCm: variant.heightCm,
  };
}

/** Cria ou atualiza uma variação, com a combinação de opções escolhida. */
export async function saveVariantAction(
  input: SaveVariantFormInput,
): Promise<VariantActionResult> {
  const parsed = saveVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const { productId, variant } = parsed.data;
  const product = await loadOwnedProduct(productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();

  // Resolve os valores escolhidos — e confirma que pertencem a este produto.
  const chosenValueIds = Object.values(variant.optionValueIds).filter(Boolean);
  const chosen = chosenValueIds.length
    ? await db
        .select({
          valueId: productOptionValues.id,
          value: productOptionValues.value,
          hexColor: productOptionValues.hexColor,
          thumbnailUrl: productOptionValues.thumbnailUrl,
          optionId: productOptions.id,
          optionName: productOptions.name,
          optionPosition: productOptions.position,
        })
        .from(productOptionValues)
        .innerJoin(
          productOptions,
          eq(productOptions.id, productOptionValues.optionId),
        )
        .where(
          and(
            eq(productOptions.productId, productId),
            inArray(productOptionValues.id, chosenValueIds),
          ),
        )
    : [];

  if (chosen.length !== chosenValueIds.length) {
    return {
      ok: false,
      error: "Alguma opção escolhida não pertence a este produto.",
    };
  }

  chosen.sort((a, b) => a.optionPosition - b.optionPosition);

  const pairs = chosen.map((row) => ({
    optionName: row.optionName,
    value: row.value,
  }));
  const optionsKey = pairs.length ? buildOptionsKey(pairs) : null;
  const name =
    variant.name ?? (pairs.length ? buildVariantName(pairs) : "Padrão");

  // Combinação duplicada: recusada antes de o banco reclamar, para o
  // administrador receber uma mensagem em português e não um erro de índice.
  if (optionsKey) {
    const duplicate = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          eq(productVariants.optionsKey, optionsKey),
          isNull(productVariants.archivedAt),
          variant.id ? ne(productVariants.id, variant.id) : undefined,
        ),
      )
      .limit(1);

    if (duplicate.length > 0) {
      return {
        ok: false,
        error: `Já existe uma variação com a combinação "${name}".`,
      };
    }
  }

  // SKU repetido dentro da loja: mesma lógica — mensagem clara antes do índice.
  if (variant.sku) {
    const duplicateSku = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.workspaceId, workspaceId),
          eq(productVariants.sku, variant.sku),
          isNull(productVariants.archivedAt),
          variant.id ? ne(productVariants.id, variant.id) : undefined,
        ),
      )
      .limit(1);

    if (duplicateSku.length > 0) {
      return {
        ok: false,
        error: `O SKU "${variant.sku}" já é usado por outra variação.`,
      };
    }
  }

  const taken = await takenPublicIds(productId, variant.id);
  const publicId = uniquePublicId(buildPublicId(pairs, name), taken);

  try {
    let variantId = variant.id ?? "";

    await db.transaction(async (tx) => {
      const values = {
        workspaceId,
        productId,
        name,
        publicName: variant.publicName,
        optionsKey,
        sku: variant.sku,
        barcode: variant.barcode,
        priceCents: variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents,
        costCents: variant.costCents,
        stockQuantity: variant.stockQuantity ?? 0,
        trackInventory: variant.trackInventory,
        allowBackorder: variant.allowBackorder,
        purchaseLimit: variant.purchaseLimit,
        status: variant.status,
        position: variant.position ?? 0,
        weightGrams: variant.weightGrams,
        dimensions: dimensionsOf(variant),
        mainImageUrl: variant.mainImageUrl,
        thumbnailUrl:
          variant.thumbnailUrl ??
          chosen.find((row) => row.thumbnailUrl)?.thumbnailUrl ??
          null,
        shareImageUrl: variant.shareImageUrl,
        hexColor:
          variant.hexColor ??
          chosen.find((row) => row.hexColor)?.hexColor ??
          null,
        isActive: variant.status === "active",
        attributes: Object.fromEntries(
          pairs.map((pair) => [pair.optionName, pair.value]),
        ),
        updatedAt: new Date(),
      };

      if (variant.id) {
        await tx
          .update(productVariants)
          .set(values)
          .where(
            and(
              eq(productVariants.id, variant.id),
              eq(productVariants.workspaceId, workspaceId),
            ),
          );
        variantId = variant.id;
      } else {
        const [created] = await tx
          .insert(productVariants)
          .values({ ...values, publicId })
          .returning({ id: productVariants.id });
        variantId = created.id;
      }

      // Combinação: reescrita por completo, é o registro mais simples de
      // manter consistente com o que o formulário enviou.
      await tx
        .delete(productVariantValues)
        .where(eq(productVariantValues.variantId, variantId));

      if (chosen.length > 0) {
        await tx.insert(productVariantValues).values(
          chosen.map((row) => ({
            workspaceId,
            variantId,
            optionId: row.optionId,
            optionValueId: row.valueId,
          })),
        );
      }

      await replaceVariantMedia(tx, workspaceId, variantId, variant.gallery);

      // Padrão exclusivo: desmarca as outras antes de marcar esta, senão o
      // índice único parcial do banco recusa a escrita.
      if (variant.isDefault) {
        await tx
          .update(productVariants)
          .set({ isDefault: false })
          .where(
            and(
              eq(productVariants.productId, productId),
              ne(productVariants.id, variantId),
            ),
          );
        await tx
          .update(productVariants)
          .set({ isDefault: true })
          .where(eq(productVariants.id, variantId));
      } else {
        await tx
          .update(productVariants)
          .set({ isDefault: false })
          .where(eq(productVariants.id, variantId));

        // Produto não pode ficar sem padrão: promove a primeira ativa.
        const remaining = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.isDefault, true),
              isNull(productVariants.archivedAt),
            ),
          )
          .limit(1);

        if (remaining.length === 0) {
          const [first] = await tx
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(
              and(
                eq(productVariants.productId, productId),
                isNull(productVariants.archivedAt),
              ),
            )
            .orderBy(asc(productVariants.position))
            .limit(1);

          if (first) {
            await tx
              .update(productVariants)
              .set({ isDefault: true })
              .where(eq(productVariants.id, first.id));
          }
        }
      }
    });

    await recordAuditLog({
      action: variant.id
        ? "product.variant_updated"
        : "product.variant_created",
      entityType: "product_variant",
      entityId: variantId,
      changes: { productId, name, priceCents: variant.priceCents },
    });

    revalidateProduct(productId, product.slug);
    return { ok: true, message: `Variação "${name}" salva.` };
  } catch (error) {
    console.error("[variants] erro ao salvar variação:", error);
    return { ok: false, error: "Não foi possível salvar a variação." };
  }
}

/** Duplica uma variação (sem combinação de opções, para o admin ajustar). */
export async function duplicateVariantAction(input: {
  productId: string;
  variantId: string;
}): Promise<VariantActionResult> {
  const parsed = variantIdSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const product = await loadOwnedProduct(parsed.data.productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();
  const [source] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, parsed.data.variantId),
        eq(productVariants.productId, parsed.data.productId),
        eq(productVariants.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!source) return { ok: false, error: "Variação não encontrada." };

  const taken = await takenPublicIds(parsed.data.productId);
  const name = `${source.name} (cópia)`;
  const publicId = uniquePublicId(buildPublicId([], name), taken);

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(productVariants)
        .values({
          workspaceId,
          productId: parsed.data.productId,
          name,
          publicName: source.publicName,
          publicId,
          // Sem `optionsKey` nem SKU: a cópia ainda não tem combinação nem
          // código próprios — os dois campos são únicos no banco.
          optionsKey: null,
          sku: null,
          barcode: null,
          priceCents: source.priceCents,
          compareAtPriceCents: source.compareAtPriceCents,
          costCents: source.costCents,
          currency: source.currency,
          stockQuantity: 0,
          trackInventory: source.trackInventory,
          allowBackorder: source.allowBackorder,
          purchaseLimit: source.purchaseLimit,
          status: "unavailable",
          isDefault: false,
          position: source.position + 1,
          weightGrams: source.weightGrams,
          dimensions: source.dimensions,
          mainImageUrl: source.mainImageUrl,
          thumbnailUrl: source.thumbnailUrl,
          shareImageUrl: source.shareImageUrl,
          hexColor: source.hexColor,
          attributes: source.attributes,
          isActive: false,
        })
        .returning({ id: productVariants.id });

      const media = await tx
        .select()
        .from(productVariantMedia)
        .where(eq(productVariantMedia.variantId, source.id))
        .orderBy(asc(productVariantMedia.position));

      if (media.length > 0) {
        await tx.insert(productVariantMedia).values(
          media.map((item) => ({
            workspaceId,
            variantId: created.id,
            url: item.url,
            alt: item.alt,
            position: item.position,
            isPrimary: item.isPrimary,
          })),
        );
      }
    });

    revalidateProduct(parsed.data.productId, product.slug);
    return {
      ok: true,
      message:
        "Variação duplicada como indisponível. Defina a combinação e o SKU antes de ativar.",
    };
  } catch (error) {
    console.error("[variants] erro ao duplicar variação:", error);
    return { ok: false, error: "Não foi possível duplicar a variação." };
  }
}

/**
 * Remove uma variação. Se já houver pedidos com ela, arquiva em vez de
 * apagar — o histórico do cliente não pode perder o que foi comprado.
 */
export async function deleteVariantAction(input: {
  productId: string;
  variantId: string;
}): Promise<VariantActionResult> {
  const parsed = variantIdSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const product = await loadOwnedProduct(parsed.data.productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();

  const [variant] = await db
    .select({ id: productVariants.id, name: productVariants.name })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, parsed.data.variantId),
        eq(productVariants.productId, parsed.data.productId),
        eq(productVariants.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!variant) return { ok: false, error: "Variação não encontrada." };

  const [usage] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(eq(orderItems.variantId, variant.id));

  const archived = (usage?.total ?? 0) > 0;

  try {
    await db.transaction(async (tx) => {
      if (archived) {
        await tx
          .update(productVariants)
          .set({
            archivedAt: new Date(),
            status: "unavailable",
            isActive: false,
            isDefault: false,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, variant.id));
      } else {
        await tx
          .delete(productVariants)
          .where(eq(productVariants.id, variant.id));
      }

      await promoteDefaultIfMissing(tx, parsed.data.productId);
    });

    await recordAuditLog({
      action: archived ? "product.variant_archived" : "product.variant_deleted",
      entityType: "product_variant",
      entityId: variant.id,
      changes: { productId: parsed.data.productId, name: variant.name },
    });

    revalidateProduct(parsed.data.productId, product.slug);
    return {
      ok: true,
      message: archived
        ? `"${variant.name}" foi arquivada — há pedidos que a usam e o histórico foi preservado.`
        : `"${variant.name}" foi excluída.`,
    };
  } catch (error) {
    console.error("[variants] erro ao excluir variação:", error);
    return { ok: false, error: "Não foi possível excluir a variação." };
  }
}

/** Promove a primeira variação ativa a padrão quando o produto ficou sem. */
async function promoteDefaultIfMissing(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  productId: string,
) {
  const current = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, productId),
        eq(productVariants.isDefault, true),
        isNull(productVariants.archivedAt),
      ),
    )
    .limit(1);

  if (current.length > 0) return;

  const [first] = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, productId),
        isNull(productVariants.archivedAt),
      ),
    )
    .orderBy(asc(productVariants.position))
    .limit(1);

  if (first) {
    await tx
      .update(productVariants)
      .set({ isDefault: true })
      .where(eq(productVariants.id, first.id));
  }
}

/** Define qual variação abre selecionada na landing page. */
export async function setDefaultVariantAction(input: {
  productId: string;
  variantId: string;
}): Promise<VariantActionResult> {
  const parsed = variantIdSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const product = await loadOwnedProduct(parsed.data.productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(productVariants)
        .set({ isDefault: false })
        .where(
          and(
            eq(productVariants.productId, parsed.data.productId),
            ne(productVariants.id, parsed.data.variantId),
          ),
        );
      await tx
        .update(productVariants)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(
          and(
            eq(productVariants.id, parsed.data.variantId),
            eq(productVariants.workspaceId, workspaceId),
            isNull(productVariants.archivedAt),
          ),
        );
    });

    revalidateProduct(parsed.data.productId, product.slug);
    return { ok: true, message: "Variação padrão atualizada." };
  } catch (error) {
    console.error("[variants] erro ao definir padrão:", error);
    return { ok: false, error: "Não foi possível definir a variação padrão." };
  }
}

/** Nova ordem de exibição das variações na página. */
export async function reorderVariantsAction(input: {
  productId: string;
  variantIds: string[];
}): Promise<VariantActionResult> {
  const parsed = reorderVariantsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const product = await loadOwnedProduct(parsed.data.productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();

  try {
    await db.transaction(async (tx) => {
      for (const [index, variantId] of parsed.data.variantIds.entries()) {
        await tx
          .update(productVariants)
          .set({ position: index, updatedAt: new Date() })
          .where(
            and(
              eq(productVariants.id, variantId),
              eq(productVariants.productId, parsed.data.productId),
              eq(productVariants.workspaceId, workspaceId),
            ),
          );
      }
    });

    revalidateProduct(parsed.data.productId, product.slug);
    return { ok: true, message: "Ordem atualizada." };
  } catch (error) {
    console.error("[variants] erro ao reordenar:", error);
    return { ok: false, error: "Não foi possível reordenar as variações." };
  }
}

/** Aplica preço, estoque, estado ou SKU a várias variações de uma vez. */
export async function bulkVariantAction(
  input: BulkActionFormInput,
): Promise<VariantActionResult> {
  const parsed = bulkActionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!isDatabaseConfigured()) return NO_DB;

  const workspaceId = await requireWorkspace();
  if (!workspaceId) return NO_SESSION;

  const data = parsed.data;
  const product = await loadOwnedProduct(data.productId, workspaceId);
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const db = getDb();
  const scope = and(
    eq(productVariants.productId, data.productId),
    eq(productVariants.workspaceId, workspaceId),
    inArray(productVariants.id, data.variantIds),
  );

  try {
    if (data.action === "delete") {
      // Exclusão em massa só apaga o que nunca foi vendido; o resto é
      // arquivado, preservando os pedidos antigos.
      const used = await db
        .select({ variantId: orderItems.variantId })
        .from(orderItems)
        .where(inArray(orderItems.variantId, data.variantIds));

      const usedIds = new Set(
        used.map((row) => row.variantId).filter(Boolean) as string[],
      );
      const deletable = data.variantIds.filter((id) => !usedIds.has(id));

      await db.transaction(async (tx) => {
        if (deletable.length > 0) {
          await tx
            .delete(productVariants)
            .where(
              and(
                eq(productVariants.productId, data.productId),
                eq(productVariants.workspaceId, workspaceId),
                inArray(productVariants.id, deletable),
              ),
            );
        }
        if (usedIds.size > 0) {
          await tx
            .update(productVariants)
            .set({
              archivedAt: new Date(),
              status: "unavailable",
              isActive: false,
              isDefault: false,
            })
            .where(
              and(
                eq(productVariants.productId, data.productId),
                inArray(productVariants.id, [...usedIds]),
              ),
            );
        }
        await promoteDefaultIfMissing(tx, data.productId);
      });

      revalidateProduct(data.productId, product.slug);
      return {
        ok: true,
        message: usedIds.size
          ? `${deletable.length} excluída(s); ${usedIds.size} arquivada(s) por terem pedidos.`
          : `${deletable.length} variação(ões) excluída(s).`,
      };
    }

    if (data.action === "generate_sku") {
      const rows = await db
        .select({
          id: productVariants.id,
          name: productVariants.name,
        })
        .from(productVariants)
        .where(scope);

      await db.transaction(async (tx) => {
        for (const row of rows) {
          await tx
            .update(productVariants)
            .set({
              sku: suggestSku(product.sku ?? product.slug, [row.name]),
              updatedAt: new Date(),
            })
            .where(eq(productVariants.id, row.id));
        }
      });

      revalidateProduct(data.productId, product.slug);
      return {
        ok: true,
        message: `SKU gerado para ${rows.length} variação(ões).`,
      };
    }

    const patch: Partial<typeof productVariants.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.action === "set_price")
      patch.priceCents = data.priceCents as number;
    if (data.action === "set_compare_at_price") {
      patch.compareAtPriceCents = data.priceCents as number;
    }
    if (data.action === "set_stock")
      patch.stockQuantity = data.stockQuantity as number;
    if (data.action === "activate") {
      patch.status = "active";
      patch.isActive = true;
    }
    if (data.action === "deactivate") {
      patch.status = "unavailable";
      patch.isActive = false;
    }

    await db.update(productVariants).set(patch).where(scope);

    await recordAuditLog({
      action: "product.variants_bulk_updated",
      entityType: "product",
      entityId: data.productId,
      changes: { action: data.action, count: data.variantIds.length },
    });

    revalidateProduct(data.productId, product.slug);
    return {
      ok: true,
      message: `${data.variantIds.length} variação(ões) atualizada(s).`,
    };
  } catch (error) {
    console.error("[variants] erro em ação em massa:", error);
    return { ok: false, error: "Não foi possível aplicar a ação em massa." };
  }
}
