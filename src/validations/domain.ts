import { z } from "zod";

/** Rótulos de domínio separados por ponto, com TLD de pelo menos 2 letras. */
const HOSTNAME_PATTERN =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,}$/;

/**
 * Aceita o que a pessoa copiar da barra do navegador — `https://`, `www.`,
 * barra final, maiúsculas — e guarda sempre a forma canônica, igual à que o
 * proxy calcula a partir do header `Host` (ver `normalizeHost`).
 */
export const domainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) =>
      value
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "")
        .split(":")[0]
        .trim(),
    )
    .pipe(
      z
        .string()
        .min(4, "Informe o domínio")
        .max(253, "Domínio muito longo")
        .regex(HOSTNAME_PATTERN, "Domínio inválido (ex.: minhaloja.online)"),
    ),
  /** Produto servido na raiz do domínio; vazio = só as rotas públicas */
  productId: z
    .string()
    .uuid("Produto inválido")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
});

export type DomainInput = z.infer<typeof domainSchema>;
