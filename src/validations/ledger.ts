import { z } from "zod";

export const createManualLedgerEntrySchema = z.object({
  type: z.enum(["manual_in", "manual_out"]),
  description: z.string().trim().min(2, "Descreva o lançamento"),
  category: z.string().trim().max(80).optional(),
  amountCents: z.coerce.number().int().positive("Informe um valor maior que zero"),
});

export type CreateManualLedgerEntryInput = z.infer<
  typeof createManualLedgerEntrySchema
>;
