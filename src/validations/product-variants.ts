import { z } from "zod";

/**
 * Validação das variações — a mesma no navegador e no servidor.
 *
 * Preços chegam do formulário em unidades monetárias (39,90) e saem daqui
 * já em centavos inteiros: nenhuma conta em ponto flutuante sobrevive à
 * fronteira.
 */

const uuid = z.string().uuid("Registro inválido");

/** "39,90" e "39.90" viram 3990. Vazio vira `null`. */
const optionalMoneyCents = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((raw) => {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim().replace(",", ".");
    if (text === "") return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100);
  })
  .refine((cents) => cents === null || cents >= 0, {
    message: "O preço não pode ser negativo",
  });

const requiredMoneyCents = optionalMoneyCents.refine(
  (cents): cents is number => cents !== null,
  { message: "Informe o preço da variação" },
);

const optionalInt = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((raw) => {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    if (text === "") return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  })
  .refine((value) => value === null || value >= 0, {
    message: "Use um número igual ou maior que zero",
  });

const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((raw) => {
      const text = typeof raw === "string" ? raw.trim() : "";
      return text === "" ? null : text.slice(0, max);
    });

/** Cor hexadecimal (#RRGGBB). Vazio é aceite — a amostra vira só o nome. */
const optionalHex = z
  .union([z.string(), z.null()])
  .optional()
  .transform((raw) => (typeof raw === "string" ? raw.trim() : ""))
  .refine((value) => value === "" || /^#[0-9a-fA-F]{6}$/.test(value), {
    message: "Use uma cor no formato #RRGGBB",
  })
  .transform((value) => (value === "" ? null : value.toUpperCase()));

/**
 * URL de imagem: só http(s) e sem `javascript:`. O upload do painel devolve
 * sempre uma URL do Storage do Supabase, mas o campo aceita colagem manual.
 */
const optionalImageUrl = z
  .union([z.string(), z.null()])
  .optional()
  .transform((raw) => (typeof raw === "string" ? raw.trim() : ""))
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
    message: "A imagem precisa de um endereço http(s) válido",
  })
  .transform((value) => (value === "" ? null : value.slice(0, 2048)));

export const variantStatusSchema = z.enum([
  "active",
  "sold_out",
  "unavailable",
]);

// ---------------------------------------------------------------------------
// Atributos e valores
// ---------------------------------------------------------------------------

export const optionValueInputSchema = z.object({
  id: uuid.optional(),
  value: z
    .string()
    .trim()
    .min(1, "Dê um nome ao valor da opção")
    .max(60, "Valor muito longo"),
  label: optionalText(80),
  hexColor: optionalHex,
  thumbnailUrl: optionalImageUrl,
});

export const optionInputSchema = z.object({
  id: uuid.optional(),
  name: z
    .string()
    .trim()
    .min(1, "Dê um nome ao atributo (ex.: Cor)")
    .max(40, "Nome do atributo muito longo"),
  values: z
    .array(optionValueInputSchema)
    .min(1, "Cada atributo precisa de pelo menos um valor")
    .max(50, "Máximo de 50 valores por atributo")
    .superRefine((values, ctx) => {
      const seen = new Set<string>();
      for (const item of values) {
        const key = item.value.toLocaleLowerCase("pt-BR");
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: `O valor "${item.value}" está repetido`,
          });
        }
        seen.add(key);
      }
    }),
});

export const saveOptionsSchema = z.object({
  productId: uuid,
  hasVariants: z.coerce.boolean(),
  options: z
    .array(optionInputSchema)
    .max(3, "Use no máximo 3 atributos por produto")
    .superRefine((options, ctx) => {
      const seen = new Set<string>();
      for (const option of options) {
        const key = option.name.toLocaleLowerCase("pt-BR");
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: `O atributo "${option.name}" está repetido`,
          });
        }
        seen.add(key);
      }
    }),
});

export type SaveOptionsInput = z.infer<typeof saveOptionsSchema>;
/** O que o formulário envia (preços como texto, campos opcionais ausentes). */
export type SaveOptionsFormInput = z.input<typeof saveOptionsSchema>;

// ---------------------------------------------------------------------------
// Variações
// ---------------------------------------------------------------------------

export const variantInputSchema = z
  .object({
    id: uuid.optional(),
    /** Valores escolhidos: `{ [optionId]: optionValueId }` */
    optionValueIds: z.record(z.string(), z.string()).default({}),
    name: optionalText(120),
    publicName: optionalText(120),
    sku: optionalText(64),
    barcode: optionalText(64),
    priceCents: requiredMoneyCents,
    compareAtPriceCents: optionalMoneyCents,
    costCents: optionalMoneyCents,
    stockQuantity: optionalInt,
    trackInventory: z.coerce.boolean().default(true),
    allowBackorder: z.coerce.boolean().default(false),
    purchaseLimit: optionalInt,
    status: variantStatusSchema.default("active"),
    isDefault: z.coerce.boolean().default(false),
    position: optionalInt,
    weightGrams: optionalInt,
    lengthCm: optionalInt,
    widthCm: optionalInt,
    heightCm: optionalInt,
    mainImageUrl: optionalImageUrl,
    thumbnailUrl: optionalImageUrl,
    shareImageUrl: optionalImageUrl,
    hexColor: optionalHex,
    gallery: z.array(optionalImageUrl).max(12).default([]),
  })
  .superRefine((data, ctx) => {
    // Preço anterior menor ou igual ao atual não é desconto — recusar aqui
    // evita a página mostrar "-0%" ou um riscado sem sentido.
    if (
      data.compareAtPriceCents !== null &&
      data.compareAtPriceCents <= data.priceCents
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["compareAtPriceCents"],
        message: "O preço anterior precisa ser maior que o preço de venda",
      });
    }
  });

export type VariantInput = z.infer<typeof variantInputSchema>;

export const saveVariantSchema = z.object({
  productId: uuid,
  variant: variantInputSchema,
});

export type SaveVariantFormInput = z.input<typeof saveVariantSchema>;

export const bulkActionSchema = z
  .object({
    productId: uuid,
    variantIds: z.array(uuid).min(1, "Escolha pelo menos uma variação"),
    action: z.enum([
      "set_price",
      "set_compare_at_price",
      "set_stock",
      "activate",
      "deactivate",
      "generate_sku",
      "delete",
    ]),
    priceCents: optionalMoneyCents,
    stockQuantity: optionalInt,
  })
  .superRefine((data, ctx) => {
    if (
      (data.action === "set_price" || data.action === "set_compare_at_price") &&
      data.priceCents === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["priceCents"],
        message: "Informe o valor",
      });
    }
    if (data.action === "set_stock" && data.stockQuantity === null) {
      ctx.addIssue({
        code: "custom",
        path: ["stockQuantity"],
        message: "Informe a quantidade",
      });
    }
  });

export type BulkActionInput = z.infer<typeof bulkActionSchema>;
export type BulkActionFormInput = z.input<typeof bulkActionSchema>;

export const reorderVariantsSchema = z.object({
  productId: uuid,
  variantIds: z.array(uuid).min(1),
});

export const variantIdSchema = z.object({
  productId: uuid,
  variantId: uuid,
});

/**
 * Identificador público vindo da URL (`?variant=preto`). Aceita apenas o
 * formato que geramos — nunca é usado para montar SQL, mas restringir aqui
 * mantém o registro de eventos limpo.
 */
export const publicVariantIdSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9-]*$/, "Variação inválida");
