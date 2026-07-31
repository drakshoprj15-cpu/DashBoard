import { z } from "zod";

export const brandingSchema = z.object({
  storeName: z.string().trim().min(2, "Dê um nome à loja"),
  logoUrl: z
    .string()
    .trim()
    .url("URL da logo inválida")
    .optional()
    .or(z.literal("")),
  supportEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido")
    .optional()
    .or(z.literal("")),
});

export type BrandingInput = z.infer<typeof brandingSchema>;
