import { z } from "zod";

/** Telemóvel PT no formato aceito pelo MB WAY/Broski: +3519XXXXXXXX */
const PT_MOBILE_REGEX = /^\+3519\d{8}$/;
/** Código postal PT: NNNN-NNN (formato exigido pela API Broski) */
const PT_POSTAL_REGEX = /^\d{4}-\d{3}$/;
export const checkoutSchema = z
  .object({
    firstName: z.string().trim().min(2, "Informe o seu nome"),
    lastName: z.string().trim().min(2, "Informe o apelido"),
    email: z.string().trim().email("Informe um e-mail válido"),
    phone: z
      .string()
      .trim()
      .regex(
        PT_MOBILE_REGEX,
        "Telemóvel PT no formato +3519XXXXXXXX",
      ),
    addressLine1: z.string().trim().min(4, "Informe a morada"),
    addressLine2: z.string().trim().optional().or(z.literal("")),
    postalCode: z
      .string()
      .trim()
      .regex(PT_POSTAL_REGEX, "Código postal no formato 1234-567"),
    city: z.string().trim().min(2, "Informe a localidade"),
    paymentMethod: z.enum(["mbway", "multibanco"], {
      message: "Escolha a forma de pagamento",
    }),
    quantity: z.coerce.number().int().min(1).max(10),
    productSlug: z.string().trim().min(1),
  })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutSchema>;
