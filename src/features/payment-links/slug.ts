import { createHash, randomInt } from "node:crypto";

/**
 * Alfabeto sem caracteres ambíguos: nada de 0/O nem 1/l/I. O slug é lido em
 * voz alta e digitado à mão por clientes ao telemóvel.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Comprimento do token público — 10 chars ≈ 55 bits de entropia. */
const TOKEN_LENGTH = 10;

/**
 * Token público do link de pagamento.
 *
 * Aleatório criptográfico, nunca derivado de id incremental: o endereço de
 * uma cobrança não pode ser adivinhado a partir do endereço de outra.
 */
export function generatePaymentLinkSlug(length = TOKEN_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

/** Chave de idempotência estável de uma tentativa de cobrança. */
export function buildPaymentIdempotencyKey(orderId: string): string {
  return `plink_${orderId}`;
}

/**
 * Reserva uma tentativa antes de falar com o gateway. A mesma tentativa do
 * navegador gera a mesma chave, mesmo que duas requests cheguem em paralelo.
 */
export function buildPaymentAttemptIdempotencyKey(
  paymentLinkId: string,
  attemptId: string,
): string {
  const digest = createHash("sha256")
    .update(`${paymentLinkId}:${attemptId}`)
    .digest("hex")
    .slice(0, 40);
  return `plink_attempt_${digest}`;
}
