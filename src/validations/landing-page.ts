import { z } from "zod";

import { BLOCK_TYPES } from "@/features/landing-pages/types";
import { isValidLandingSlug } from "@/features/landing-pages/sanitize";

const MAX_CODE_LENGTH = 50_000;
const MAX_BLOCKS = 200;

const hexColor = z
  .string()
  .trim()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Use uma cor no formato #RRGGBB",
  );

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    isValidLandingSlug,
    "Use 3 a 60 caracteres: minúsculas, números e hífens. Alguns endereços são reservados pelo sistema.",
  );

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) =>
      value === "" ||
      value.startsWith("/") ||
      /^https?:\/\//i.test(value) ||
      value.startsWith("#"),
    "Informe um endereço que comece com http://, https://, / ou #",
  )
  .optional()
  .default("");

/** Valor livre dentro de `props` — o mesmo que sobrevive a JSON. */
const blockPropValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(20_000),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(blockPropValue).max(200),
    z.record(z.string(), blockPropValue),
  ]),
);

export const blockStyleSchema = z.object({
  background: z.string().max(32).optional(),
  textColor: z.string().max(32).optional(),
  paddingTop: z.number().int().min(0).max(400).optional(),
  paddingBottom: z.number().int().min(0).max(400).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  animation: z.enum(["none", "fade", "rise"]).optional(),
  visibility: z.enum(["all", "desktop", "mobile"]).optional(),
});

export const landingBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(BLOCK_TYPES),
  hidden: z.boolean().optional(),
  anchorId: z.string().max(64).optional(),
  style: blockStyleSchema.optional(),
  props: z.record(z.string(), blockPropValue),
});

export const landingContentSchema = z.object({
  blocks: z
    .array(landingBlockSchema)
    .max(MAX_BLOCKS, `Máximo de ${MAX_BLOCKS} blocos por página`),
});

export const landingThemeSchema = z.object({
  primaryColor: hexColor,
  secondaryColor: hexColor,
  backgroundColor: hexColor,
  textColor: hexColor,
  buttonColor: hexColor,
  buttonTextColor: hexColor,
  headerBackground: hexColor,
  headerTextColor: hexColor,
  footerBackground: hexColor,
  footerTextColor: hexColor,
  variantSelectedColor: hexColor,
  headingFont: z.string().trim().max(60),
  bodyFont: z.string().trim().max(60),
  radius: z.number().int().min(0).max(48),
  shadow: z.enum(["none", "soft", "medium", "strong"]),
  maxWidth: z.number().int().min(600).max(1600),
  buttonStyle: z.enum(["solid", "outline", "soft"]),
  colorScheme: z.enum(["light", "dark"]),
});

export const landingSeoSchema = z.object({
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(320).default(""),
  keywords: z.string().trim().max(300).default(""),
  canonicalUrl: optionalUrl,
  shareImageUrl: optionalUrl,
  twitterCard: z
    .enum(["summary", "summary_large_image"])
    .default("summary_large_image"),
  noIndex: z.boolean().default(false),
  productSchema: z.boolean().default(true),
});

export const landingTrackingSchema = z.object({
  metaPixelId: z
    .string()
    .trim()
    .max(32)
    .refine(
      (v) => v === "" || /^\d{15,16}$/.test(v),
      "O Meta Pixel tem 15 ou 16 dígitos",
    )
    .default(""),
  tiktokPixelId: z.string().trim().max(64).default(""),
  ga4MeasurementId: z
    .string()
    .trim()
    .max(32)
    .refine(
      (v) => v === "" || /^G-[A-Z0-9]{6,}$/i.test(v),
      "O GA4 começa por G-",
    )
    .default(""),
  gtmContainerId: z
    .string()
    .trim()
    .max(32)
    .refine(
      (v) => v === "" || /^GTM-[A-Z0-9]{4,}$/i.test(v),
      "O GTM começa por GTM-",
    )
    .default(""),
  defaultUtm: z.string().trim().max(500).default(""),
  inheritWorkspacePixels: z.boolean().default(true),
  /** `null` herda a regra global do workspace (Meta Pixel > "pedido gerado como compra") */
  countGeneratedOrdersAsPurchase: z.boolean().nullable().default(null),
});

const codeField = z
  .string()
  .max(MAX_CODE_LENGTH, "Código muito longo (máximo de 50.000 caracteres)")
  .default("");

export const landingCustomCodeSchema = z.object({
  headCode: codeField,
  bodyStartCode: codeField,
  bodyEndCode: codeField,
  css: codeField,
  javascript: codeField,
});

export const createLandingPageSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome de controlo à página").max(120),
  publicName: z.string().trim().max(120).default(""),
  slug: slugField,
  productId: z
    .string()
    .uuid("Escolha um produto válido")
    .optional()
    .or(z.literal("")),
  template: z.string().trim().min(1, "Escolha um modelo").max(60),
  language: z.string().trim().max(10).default("pt-PT"),
  country: z.string().trim().max(4).default("PT"),
  currency: z.enum(["EUR", "BRL", "USD"]).default("EUR"),
  logoUrl: optionalUrl,
  faviconUrl: optionalUrl,
  productSync: z.boolean().default(true),
  theme: landingThemeSchema.partial().optional(),
});

export const saveDraftSchema = z.object({
  id: z.string().uuid(),
  content: landingContentSchema.optional(),
  theme: landingThemeSchema.optional(),
  seo: landingSeoSchema.optional(),
  tracking: landingTrackingSchema.optional(),
  customCode: landingCustomCodeSchema.optional(),
});

export const updateSettingsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  publicName: z.string().trim().max(120).default(""),
  slug: slugField,
  productId: z.string().uuid().optional().or(z.literal("")),
  productSync: z.boolean().default(true),
  language: z.string().trim().max(10).default("pt-PT"),
  country: z.string().trim().max(4).default("PT"),
  currency: z.enum(["EUR", "BRL", "USD"]).default("EUR"),
  logoUrl: optionalUrl,
  faviconUrl: optionalUrl,
});

export const publishSchema = z.object({
  id: z.string().uuid(),
  /** ISO local do agendamento; vazio = publicar já */
  scheduledPublishAt: z.string().trim().max(40).default(""),
});

/** Evento público enviado pela landing publicada. */
export const landingEventSchema = z.object({
  pageId: z.string().uuid(),
  event: z.enum([
    "page_view",
    "view_content",
    "select_variant",
    "cta_click",
    "add_to_cart",
    "initiate_checkout",
    "lead",
  ]),
  anonymousId: z.string().trim().min(4).max(64),
  valueCents: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.string().trim().max(4).optional(),
  source: z.string().trim().max(120).optional(),
  campaign: z.string().trim().max(120).optional(),
  blockId: z.string().trim().max(64).optional(),
  /**
   * Variação escolhida no momento do evento. Campos fechados de propósito:
   * o corpo vem do navegador e nunca deve carregar dado pessoal.
   */
  variant: z
    .object({
      id: z.string().trim().max(80),
      name: z.string().trim().max(120).optional(),
      sku: z.string().trim().max(64).optional(),
      options: z.record(z.string().max(40), z.string().max(80)).optional(),
    })
    .optional(),
});

export type CreateLandingPageInput = z.infer<typeof createLandingPageSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type LandingEventInput = z.infer<typeof landingEventSchema>;
