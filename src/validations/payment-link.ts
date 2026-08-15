import { z } from "zod";

import { normalizePtPhone } from "@/validations/checkout";

/** Código postal PT: NNNN-NNN (formato exigido pela API Broski) */
const PT_POSTAL_REGEX = /^\d{4}-\d{3}$/;
const PT_MOBILE_REGEX = /^\+3519\d{8}$/;
const PT_PHONE_REGEX = /^\+351\d{9}$/;
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SAFE_REDIRECT_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Alias amigável opcional do link (`/pagar/pedido-victor-001`).
 * Minúsculas, dígitos e hífen — nada que precise de escape na URL.
 */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/;

/** Aliases que colidiriam com rotas ou dariam ao link ar de página oficial. */
const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "painel",
  "login",
  "checkout",
  "pagar",
  "pay",
  "novo",
  "new",
  "edit",
  "editar",
  "sucesso",
  "success",
  "cancel",
  "cancelar",
  "webhook",
  "webhooks",
]);

export const requestFieldMode = z.enum(["required", "optional", "hidden"]);
export type RequestFieldMode = z.infer<typeof requestFieldMode>;

export const paymentLinkMethodSchema = z.enum(["mbway", "multibanco"]);
export type PaymentLinkMethod = z.infer<typeof paymentLinkMethodSchema>;

export const customerFieldKeySchema = z.enum([
  "firstName",
  "lastName",
  "email",
  "phone",
  "document",
  "addressLine1",
  "addressLine2",
  "postalCode",
  "city",
  "region",
  "country",
]);
export type CustomerFieldKey = z.infer<typeof customerFieldKeySchema>;

export const customerFieldSchema = z.object({
  key: customerFieldKeySchema,
  mode: requestFieldMode,
  order: z.coerce.number().int().min(0).max(30),
});
export type CustomerFieldInput = z.infer<typeof customerFieldSchema>;

export const DEFAULT_CUSTOMER_FIELDS: CustomerFieldInput[] = [
  { key: "firstName", mode: "required", order: 0 },
  { key: "lastName", mode: "optional", order: 1 },
  { key: "email", mode: "required", order: 2 },
  { key: "phone", mode: "optional", order: 3 },
  { key: "document", mode: "hidden", order: 4 },
  { key: "addressLine1", mode: "hidden", order: 5 },
  { key: "addressLine2", mode: "hidden", order: 6 },
  { key: "postalCode", mode: "hidden", order: 7 },
  { key: "city", mode: "hidden", order: 8 },
  { key: "region", mode: "hidden", order: 9 },
  { key: "country", mode: "hidden", order: 10 },
];

const hexColor = z.string().trim().regex(HEX_COLOR_REGEX, "Cor inválida");

export const paymentLinkBrandSchema = z.object({
  companyName: z.string().trim().max(100).default(""),
  logoSubtitle: z.string().trim().max(120).default(""),
  faviconUrl: z.string().trim().max(600).optional().or(z.literal("")),
  logoAlignment: z.enum(["left", "center", "right"]).default("center"),
  logoWidth: z.coerce.number().int().min(40).max(320).default(180),
  logoHeight: z.coerce.number().int().min(24).max(160).default(64),
  logoSpacing: z.coerce.number().int().min(0).max(64).default(24),
});
export type PaymentLinkBrandInput = z.infer<typeof paymentLinkBrandSchema>;

export const paymentLinkAppearanceSchema = z.object({
  backgroundType: z.enum(["solid", "gradient"]).default("solid"),
  backgroundColor: hexColor.default("#F6F7F9"),
  gradientFrom: hexColor.default("#F6F7F9"),
  gradientTo: hexColor.default("#EEEAF5"),
  gradientAngle: z.coerce.number().int().min(0).max(360).default(135),
  cardColor: hexColor.default("#FFFFFF"),
  cardWidth: z.coerce.number().int().min(320).max(720).default(460),
  cardRadius: z.coerce.number().int().min(0).max(40).default(16),
  cardBorderWidth: z.coerce.number().int().min(0).max(4).default(1),
  cardBorderColor: hexColor.default("#E5E7EB"),
  cardShadow: z.enum(["none", "soft", "medium"]).default("soft"),
  cardPadding: z.coerce.number().int().min(16).max(56).default(28),
  titleColor: hexColor.default("#18181B"),
  textColor: hexColor.default("#71717A"),
  titleSize: z.coerce.number().int().min(16).max(42).default(22),
  titleWeight: z.enum(["500", "600", "700", "800"]).default("700"),
  inputBackgroundColor: hexColor.default("#FFFFFF"),
  inputTextColor: hexColor.default("#18181B"),
  inputBorderColor: hexColor.default("#E5E7EB"),
  inputRadius: z.coerce.number().int().min(0).max(28).default(10),
  inputFocusColor: hexColor.default("#E5097F"),
  inputPlaceholderColor: hexColor.default("#A1A1AA"),
  buttonColor: hexColor.default("#E5097F"),
  buttonHoverColor: hexColor.default("#C8076E"),
  buttonTextColor: hexColor.default("#FFFFFF"),
  buttonRadius: z.coerce.number().int().min(0).max(28).default(10),
  buttonHeight: z.coerce.number().int().min(40).max(72).default(52),
  buttonFontSize: z.coerce.number().int().min(13).max(20).default(15),
  buttonWeight: z.enum(["500", "600", "700", "800"]).default("700"),
  secondaryButtonText: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .default("Voltar aos dados"),
  secondaryButtonColor: hexColor.default("#18181B"),
  secondaryButtonBackground: hexColor.default("#FFFFFF"),
  secondaryButtonBorderColor: hexColor.default("#E5E7EB"),
  securityText: z.string().trim().min(2).max(120).default("Pagamento seguro"),
});
export type PaymentLinkAppearanceInput = z.infer<
  typeof paymentLinkAppearanceSchema
>;

function isSafeRedirectUrl(value: string): boolean {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return SAFE_REDIRECT_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const paymentLinkSuccessSchema = z.object({
  title: z.string().trim().min(2).max(100).default("Pagamento confirmado"),
  description: z.string().trim().max(300).default("Recebemos o seu pagamento."),
  buttonText: z.string().trim().min(2).max(48).default("Continuar"),
  redirectUrl: z
    .string()
    .trim()
    .max(600)
    .default("")
    .refine(isSafeRedirectUrl, "Use uma URL http/https ou um caminho interno."),
  expiredTitle: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .default("Este link de pagamento expirou"),
  expiredDescription: z
    .string()
    .trim()
    .max(300)
    .default("O prazo para pagar terminou. Solicite um novo link."),
});
export type PaymentLinkSuccessInput = z.infer<typeof paymentLinkSuccessSchema>;

export const paymentLinkSeoSchema = z.object({
  browserTitle: z.string().trim().max(80).default("Pagamento"),
  description: z.string().trim().max(180).default(""),
  faviconUrl: z.string().trim().max(600).optional().or(z.literal("")),
});
export type PaymentLinkSeoInput = z.infer<typeof paymentLinkSeoSchema>;
export const paymentLinkVisitorKeySchema = z.string().trim().uuid();

const DEFAULT_BRAND_CONFIG = paymentLinkBrandSchema.parse({});
const DEFAULT_APPEARANCE_CONFIG = paymentLinkAppearanceSchema.parse({});
const DEFAULT_SUCCESS_CONFIG = paymentLinkSuccessSchema.parse({});
const DEFAULT_SEO_CONFIG = paymentLinkSeoSchema.parse({});

export const shippingOptionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2, "Dê um nome à forma de envio").max(60),
  estimate: z.string().trim().max(60).optional().or(z.literal("")),
  priceCents: z.coerce.number().int().min(0).max(100_000_00),
});

export type ShippingOptionInput = z.infer<typeof shippingOptionSchema>;

export const productSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().max(600).optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  unitPriceCents: z.coerce.number().int().min(0),
});

export type ProductSnapshotInput = z.infer<typeof productSnapshotSchema>;

/**
 * Formulário de criação/edição de um link de pagamento (painel).
 *
 * Valor mínimo de 1 € porque o Broski recusa cobranças abaixo disso — melhor
 * dizer isso no formulário do que deixar o gateway falhar na frente do
 * comprador.
 */
export const paymentLinkSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome interno ao link").max(120),
    title: z.string().trim().min(2, "Informe o título da página").max(120),
    description: z.string().trim().max(600).optional().or(z.literal("")),
    amountCents: z.coerce
      .number({ message: "Informe o valor a cobrar" })
      .int("Use um valor em euros válido")
      .min(100, "O valor mínimo é 1,00 €")
      .max(999_999_99, "O valor máximo é 999.999,99 €"),
    currency: z.literal("EUR").default("EUR"),
    paymentMethods: z.array(paymentLinkMethodSchema).max(2).default([]),

    slug: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .or(z.literal(""))
      .refine(
        (value) => !value || SLUG_REGEX.test(value),
        "Use 4 a 50 caracteres: letras minúsculas, números e hífen",
      )
      .refine(
        (value) => !value || !RESERVED_SLUGS.has(value),
        "Este endereço é reservado. Escolha outro.",
      ),

    showProduct: z.coerce.boolean().default(false),
    productId: z.string().trim().uuid().optional().or(z.literal("")),
    product: productSnapshotSchema.optional(),

    requestName: requestFieldMode.default("required"),
    requestEmail: requestFieldMode.default("required"),
    requestPhone: requestFieldMode.default("optional"),
    requiresAddress: z.coerce.boolean().default(false),
    requestShipping: z.coerce.boolean().default(false),
    shippingOptions: z.array(shippingOptionSchema).max(6).default([]),

    logoUrl: z.string().trim().max(600).optional().or(z.literal("")),
    buttonColor: z.string().trim().regex(HEX_COLOR_REGEX, "Cor inválida"),
    buttonTextColor: z.string().trim().regex(HEX_COLOR_REGEX, "Cor inválida"),
    borderColor: z.string().trim().regex(HEX_COLOR_REGEX, "Cor inválida"),
    backgroundStyle: z.enum(["light", "dark"]).default("light"),
    borderRadius: z.coerce.number().int().min(0).max(32).default(12),
    buttonText: z.string().trim().min(2).max(48).default("Pagar"),
    brand: paymentLinkBrandSchema.default(DEFAULT_BRAND_CONFIG),
    appearance: paymentLinkAppearanceSchema.default(DEFAULT_APPEARANCE_CONFIG),
    customerFields: z
      .array(customerFieldSchema)
      .min(1)
      .max(DEFAULT_CUSTOMER_FIELDS.length)
      .default(DEFAULT_CUSTOMER_FIELDS),
    success: paymentLinkSuccessSchema.default(DEFAULT_SUCCESS_CONFIG),
    seo: paymentLinkSeoSchema.default(DEFAULT_SEO_CONFIG),

    domainId: z.string().trim().uuid().optional().or(z.literal("")),
    metaPixelEnabled: z.coerce.boolean().default(true),
    pixelIds: z.array(z.string().uuid()).max(50).default([]),

    /** never | 1h | 24h | 3d | 7d | custom */
    expiration: z
      .enum(["never", "1h", "24h", "3d", "7d", "custom"])
      .default("never"),
    expiresAt: z.string().trim().optional().or(z.literal("")),

    /** unlimited | single | custom */
    usageLimit: z.enum(["unlimited", "single", "custom"]).default("unlimited"),
    maxPayments: z.coerce.number().int().min(1).max(10_000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.showProduct && !data.product) {
      ctx.addIssue({
        code: "custom",
        path: ["product"],
        message: "Preencha os dados do produto ou desligue a exibição.",
      });
    }

    if (data.requestShipping && data.shippingOptions.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["shippingOptions"],
        message: "Adicione ao menos uma forma de envio.",
      });
    }

    const uniqueCustomerFields = new Set(
      data.customerFields.map((field) => field.key),
    );
    if (uniqueCustomerFields.size !== data.customerFields.length) {
      ctx.addIssue({
        code: "custom",
        path: ["customerFields"],
        message: "Cada campo do cliente só pode aparecer uma vez.",
      });
    }

    if (new Set(data.pixelIds).size !== data.pixelIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["pixelIds"],
        message:
          "Cada integração de conversão só pode ser selecionada uma vez.",
      });
    }

    if (data.requestShipping) {
      for (const key of [
        "addressLine1",
        "postalCode",
        "city",
        "country",
      ] as const) {
        const field = data.customerFields.find((item) => item.key === key);
        if (!field || field.mode === "hidden") {
          ctx.addIssue({
            code: "custom",
            path: ["customerFields"],
            message: "A entrega exige morada, código postal, cidade e país.",
          });
          break;
        }
      }
    }

    // Envio pressupõe morada: sem endereço não há para onde enviar.
    if (data.requestShipping && !data.requiresAddress) {
      ctx.addIssue({
        code: "custom",
        path: ["requiresAddress"],
        message: "Para cobrar envio, peça também a morada do cliente.",
      });
    }

    if (data.expiration === "custom") {
      const parsed = data.expiresAt ? new Date(data.expiresAt) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: "Escolha uma data de expiração válida.",
        });
      } else if (parsed.getTime() <= Date.now()) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: "A expiração precisa ser no futuro.",
        });
      }
    }

    if (data.usageLimit === "custom" && !data.maxPayments) {
      ctx.addIssue({
        code: "custom",
        path: ["maxPayments"],
        message: "Informe quantos pagamentos o link aceita.",
      });
    }

    // MB WAY envia o pedido para a app do telemóvel: sem telefone, não há
    // como cobrar. Esconder o campo tornaria o link impagável por MB WAY.
    const phoneField = data.customerFields.find(
      (field) => field.key === "phone",
    );
    if (
      data.paymentMethods.includes("mbway") &&
      (phoneField?.mode === "hidden" || data.requestPhone === "hidden")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["requestPhone"],
        message:
          "O telemóvel é necessário para MB WAY — mantenha-o obrigatório ou opcional.",
      });
    }
  });

export type PaymentLinkInput = z.infer<typeof paymentLinkSchema>;

/**
 * Dados que o comprador envia na página pública.
 *
 * Repare no que NÃO está aqui: valor, moeda, frete em euros, produto ou
 * workspace. O navegador manda apenas a intenção — o servidor relê o link
 * gravado e recalcula subtotal + frete antes de criar a cobrança.
 */
export const paymentLinkCheckoutSchema = z
  .object({
    slug: z.string().trim().min(1).max(64),
    attemptId: z.string().trim().uuid(),
    method: z.enum(["mbway", "multibanco"], {
      message: "Escolha a forma de pagamento",
    }),
    name: z.string().trim().max(120).optional().or(z.literal("")),
    email: z.string().trim().max(160).optional().or(z.literal("")),
    lastName: z.string().trim().max(120).optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    document: z.string().trim().max(32).optional().or(z.literal("")),
    addressLine1: z.string().trim().max(160).optional().or(z.literal("")),
    addressLine2: z.string().trim().max(160).optional().or(z.literal("")),
    postalCode: z.string().trim().max(20).optional().or(z.literal("")),
    city: z.string().trim().max(80).optional().or(z.literal("")),
    region: z.string().trim().max(80).optional().or(z.literal("")),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use o código do país com 2 letras (ex.: PT).")
      .default("PT"),
    /** Só o identificador da opção — o preço vem do link gravado */
    shippingOptionId: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .passthrough();

export type PaymentLinkCheckoutInput = z.infer<
  typeof paymentLinkCheckoutSchema
>;

export interface CustomerFieldRules {
  requestName: RequestFieldMode;
  requestEmail: RequestFieldMode;
  requestPhone: RequestFieldMode;
  requiresAddress: boolean;
  customerFields?: CustomerFieldInput[];
}

export interface CustomerFieldError {
  field: string;
  message: string;
}

/**
 * Valida os dados do comprador contra as regras GRAVADAS no link.
 *
 * Roda no servidor: as regras vêm do banco, não do formulário — esconder um
 * campo no HTML não muda o que é exigido aqui.
 */
export function validateCustomerFields(
  input: PaymentLinkCheckoutInput,
  rules: CustomerFieldRules,
): CustomerFieldError[] {
  const errors: CustomerFieldError[] = [];
  const phone = input.phone ? normalizePtPhone(input.phone) : "";

  if (rules.customerFields?.length) {
    const values: Record<CustomerFieldKey, string> = {
      firstName: input.name ?? "",
      lastName: input.lastName ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      document: input.document ?? "",
      addressLine1: input.addressLine1 ?? "",
      addressLine2: input.addressLine2 ?? "",
      postalCode: input.postalCode ?? "",
      city: input.city ?? "",
      region: input.region ?? "",
      country: input.country ?? "",
    };
    for (const field of rules.customerFields) {
      if (field.mode === "required" && values[field.key].trim().length === 0) {
        errors.push({
          field: field.key === "firstName" ? "name" : field.key,
          message: "Preencha este campo obrigatório.",
        });
      }
    }
  }

  if (
    rules.requestName === "required" &&
    (input.name ?? "").trim().length < 2
  ) {
    errors.push({ field: "name", message: "Informe o seu nome." });
  }

  const email = (input.email ?? "").trim();
  if (rules.requestEmail === "required" && !email) {
    errors.push({ field: "email", message: "Informe o seu e-mail." });
  }
  if (email && !z.string().email().safeParse(email).success) {
    errors.push({ field: "email", message: "Informe um e-mail válido." });
  }

  if (input.method === "mbway") {
    if (!phone) {
      errors.push({
        field: "phone",
        message: "O MB WAY precisa do seu telemóvel para enviar o pedido.",
      });
    } else if (!PT_MOBILE_REGEX.test(phone)) {
      errors.push({
        field: "phone",
        message: "Informe um telemóvel português (ex.: 912 345 678).",
      });
    }
  } else {
    if (rules.requestPhone === "required" && !phone) {
      errors.push({ field: "phone", message: "Informe o seu telefone." });
    }
    if (phone && !PT_PHONE_REGEX.test(phone)) {
      errors.push({
        field: "phone",
        message: "Telefone inválido. Use 9 dígitos (ex.: 222 001 079).",
      });
    }
  }

  if (rules.requiresAddress) {
    if ((input.addressLine1 ?? "").trim().length < 4) {
      errors.push({ field: "addressLine1", message: "Informe a morada." });
    }
    if (
      input.country === "PT" &&
      !PT_POSTAL_REGEX.test((input.postalCode ?? "").trim())
    ) {
      errors.push({
        field: "postalCode",
        message: "Código postal no formato 1234-567.",
      });
    }
    if (input.country !== "PT" && (input.postalCode ?? "").trim().length < 2) {
      errors.push({ field: "postalCode", message: "Informe o código postal." });
    }
    if ((input.city ?? "").trim().length < 2) {
      errors.push({ field: "city", message: "Informe a localidade." });
    }
  }

  return errors;
}
