export const MAX_RECIPIENTS_PER_CAMPAIGN_BATCH = 500;
export const MAX_CAMPAIGN_RECIPIENTS = 10_000;

export function getCampaignBatchCount(totalRecipients: number): number {
  if (!Number.isFinite(totalRecipients) || totalRecipients <= 0) return 0;
  return Math.ceil(totalRecipients / MAX_RECIPIENTS_PER_CAMPAIGN_BATCH);
}

export function splitCampaignRecipients<T>(recipients: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (
    let offset = 0;
    offset < recipients.length;
    offset += MAX_RECIPIENTS_PER_CAMPAIGN_BATCH
  ) {
    batches.push(
      recipients.slice(offset, offset + MAX_RECIPIENTS_PER_CAMPAIGN_BATCH),
    );
  }
  return batches;
}
