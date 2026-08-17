import { describe, expect, it } from "vitest";

import {
  getCampaignBatchCount,
  MAX_CAMPAIGN_RECIPIENTS,
  MAX_RECIPIENTS_PER_CAMPAIGN_BATCH,
  splitCampaignRecipients,
} from "@/features/emails/batching";

describe("lotes de campanhas de email", () => {
  it("divide 1.153 destinatários em lotes de 500, 500 e 153", () => {
    const recipients = Array.from({ length: 1_153 }, (_, index) => index);
    const batches = splitCampaignRecipients(recipients);

    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 153]);
    expect(batches.flat()).toEqual(recipients);
    expect(getCampaignBatchCount(recipients.length)).toBe(3);
  });

  it("mantém o limite por lote e aceita campanhas maiores que 500", () => {
    expect(MAX_RECIPIENTS_PER_CAMPAIGN_BATCH).toBe(500);
    expect(MAX_CAMPAIGN_RECIPIENTS).toBeGreaterThan(1_153);
    expect(getCampaignBatchCount(0)).toBe(0);
    expect(getCampaignBatchCount(500)).toBe(1);
    expect(getCampaignBatchCount(501)).toBe(2);
  });
});
