import { z } from "zod";

/** Tipos de movimentação manual disponíveis na UI. */
export const MOVEMENT_TYPE_LABEL = {
  restock: "Entrada (reposição)",
  adjustment: "Saída (avaria, perda, brinde)",
  correction: "Correção de contagem",
} as const;

export type MovementType = keyof typeof MOVEMENT_TYPE_LABEL;

export const adjustStockSchema = z.object({
  productId: z.string().uuid("Produto inválido"),
  type: z.enum(["restock", "adjustment", "correction"]),
  /**
   * Entrada/saída: sempre positivo (o sinal vem de `type`). Correção: pode
   * ser negativo, para acertar uma contagem física para menos.
   */
  quantity: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, "Informe uma quantidade diferente de zero"),
  note: z.string().trim().max(280).optional(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const updateMinStockSchema = z.object({
  productId: z.string().uuid("Produto inválido"),
  minStockAlert: z.coerce.number().int().min(0).optional(),
});

export type UpdateMinStockInput = z.infer<typeof updateMinStockSchema>;
