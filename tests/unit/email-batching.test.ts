import { describe, expect, it } from "vitest";

import { splitProviderBatches } from "@/features/emails/batching";
import { MAX_EMAILS_PER_BATCH } from "@/features/emails/resend-provider";

describe("processamento interno de campanhas de email", () => {
  it("processa toda a campanha sem impor um limite visível de 500", () => {
    const recipients = Array.from({ length: 1_153 }, (_, index) => index);
    const batches = splitProviderBatches(recipients, MAX_EMAILS_PER_BATCH);

    expect(batches).toHaveLength(12);
    expect(batches.slice(0, -1).every((batch) => batch.length === 100)).toBe(
      true,
    );
    expect(batches.at(-1)).toHaveLength(53);
    expect(batches.flat()).toEqual(recipients);
  });

  it("rejeita somente um tamanho técnico inválido", () => {
    expect(() => splitProviderBatches([1], 0)).toThrow(
      "O tamanho do lote técnico deve ser um inteiro positivo.",
    );
  });
});
