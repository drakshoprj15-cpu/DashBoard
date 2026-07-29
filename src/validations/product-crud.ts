import { z } from "zod";

/** Slug público: minúsculas, números e hífens. */
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Converte um nome livre num slug seguro para URL. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O endereço precisa de pelo menos 3 caracteres")
  .max(80, "Endereço muito longo")
  .regex(SLUG_REGEX, "Use apenas minúsculas, números e hífens");

const productTypeEnum = z.enum([
  "physical",
  "digital",
  "service",
  "subscription",
]);

export const createProductSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao produto"),
  slug: slugField,
  type: productTypeEnum,
  priceCents: z.coerce
    .number()
    .int()
    .positive("O preço precisa ser maior que zero"),
  currency: z.enum(["BRL", "EUR"]),
  shortDescription: z.string().trim().max(300).optional(),
  mainImageUrl: z
    .string()
    .trim()
    .url("URL de imagem inválida")
    .optional()
    .or(z.literal("")),
  trackInventory: z.coerce.boolean().optional(),
  stockQuantity: z.coerce.number().int().min(0).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductCoreSchema = createProductSchema.extend({
  id: z.string().uuid("Produto inválido"),
});

export type UpdateProductCoreInput = z.infer<typeof updateProductCoreSchema>;

/** Divide um textarea em linhas não vazias. */
function linesOf(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Divide um textarea em parágrafos (linhas em branco separam blocos). */
function paragraphsOf(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Divide um textarea "Chave: Valor" por linha em pares, ignorando linhas sem ":". */
function specsOf(value: unknown): [string, string][] {
  return linesOf(value)
    .map((line): [string, string] | null => {
      const idx = line.indexOf(":");
      if (idx < 0) return null;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!key || !val) return null;
      return [key, val];
    })
    .filter((pair): pair is [string, string] => pair !== null);
}

export const updateProductLandingSchema = z.object({
  id: z.string().uuid("Produto inválido"),
  brand: z.string().trim().max(120).optional(),
  compareAtPriceCents: z.coerce.number().int().positive().optional(),
  gallery: z.string().optional().transform(linesOf),
  freeShippingFromCents: z.coerce.number().int().min(0).default(0),
  deliveryEstimate: z.string().trim().max(120).default("2–4 dias úteis"),
  returnDays: z.coerce.number().int().min(0).default(14),
  description: z.string().optional().transform(paragraphsOf),
  highlights: z.string().optional().transform(linesOf),
  specs: z.string().optional().transform(specsOf),
});

export type UpdateProductLandingInput = z.infer<
  typeof updateProductLandingSchema
>;
