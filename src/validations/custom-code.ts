import { z } from "zod";

/** Limite generoso, mas suficiente para impedir abuso do campo de texto. */
const MAX_CODE_LENGTH = 50_000;

const codeField = z
  .string()
  .max(MAX_CODE_LENGTH, "Código muito longo (máximo de 50.000 caracteres)")
  .optional();

export const customCodeSchema = z
  .object({
    id: z.string().uuid("Produto inválido"),
    metaPixelId: z.string().trim().optional(),
    metaPixelEnabled: z.coerce.boolean().optional(),
    customHeadCode: codeField,
    customBodyStartCode: codeField,
    customCss: codeField,
    customJavaScript: codeField,
    customBodyEndCode: codeField,
  })
  .superRefine((data, ctx) => {
    if (data.metaPixelId && !/^\d{15,16}$/.test(data.metaPixelId)) {
      ctx.addIssue({
        code: "custom",
        path: ["metaPixelId"],
        message: "O ID do Meta Pixel tem 15 ou 16 dígitos",
      });
    }
    if (data.metaPixelEnabled && !data.metaPixelId) {
      ctx.addIssue({
        code: "custom",
        path: ["metaPixelId"],
        message: "Informe o ID do Pixel antes de ativar",
      });
    }
  });

export type CustomCodeInput = z.infer<typeof customCodeSchema>;
