export function splitProviderBatches<T>(
  recipients: readonly T[],
  batchSize: number,
): T[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("O tamanho do lote técnico deve ser um inteiro positivo.");
  }

  const batches: T[][] = [];
  for (let offset = 0; offset < recipients.length; offset += batchSize) {
    batches.push(recipients.slice(offset, offset + batchSize));
  }
  return batches;
}
