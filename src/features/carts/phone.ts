/**
 * Normalização de telefone e construção do link de WhatsApp para a
 * recuperação manual de carrinhos.
 *
 * Fonte única: antes disto, `whatsAppUrl` estava duplicado em `carts-table`
 * e `cart-detail-sheet` sem tratar indicativo nenhum. Aqui o número pode vir
 * do checkout (já normalizado para +351) ou de uma planilha importada, que
 * costuma trazer formatos livres e DDIs variados.
 *
 * Módulo isomorfo — nunca importa o cliente do banco.
 */

/**
 * Indicativo assumido quando o número não traz nenhum. Portugal, porque é o
 * país da operação (checkout PT, MB WAY/Multibanco) — o mesmo pressuposto de
 * `normalizePtPhone` em `validations/checkout.ts`.
 */
export const DEFAULT_DIAL_CODE = "351";

/** Números nacionais têm 9 dígitos em PT e 10–11 no BR; abaixo disso é lixo. */
const MIN_NATIONAL_DIGITS = 9;
const MAX_E164_DIGITS = 15;

export interface NormalizedPhone {
  /** Só dígitos, com indicativo — pronto para `wa.me`. Vazio se inválido. */
  digits: string;
  /** Formato E.164 (`+351912345678`). Vazio se inválido. */
  e164: string;
  valid: boolean;
}

/**
 * Converte um telefone em formato livre para E.164.
 *
 * Aceita `+351 912 345 678`, `00351912345678`, `351912345678`, `912345678`,
 * `(11) 98765-4321`. Quando não há indicativo, aplica `defaultDialCode`.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultDialCode: string = DEFAULT_DIAL_CODE,
): NormalizedPhone {
  const invalid: NormalizedPhone = { digits: "", e164: "", valid: false };
  if (!raw) return invalid;

  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return invalid;

  if (digits.startsWith("00")) {
    // Prefixo internacional em formato antigo (00351…).
    digits = digits.slice(2);
  } else if (!hadPlus && digits.length <= 11 && !digits.startsWith(defaultDialCode)) {
    // Número nacional sem indicativo — só então assumimos o país padrão.
    digits = `${defaultDialCode}${digits}`;
  }

  if (digits.length < MIN_NATIONAL_DIGITS || digits.length > MAX_E164_DIGITS) {
    return invalid;
  }

  return { digits, e164: `+${digits}`, valid: true };
}

/**
 * Link `wa.me` com a mensagem já preenchida. Devolve `null` quando o número
 * não é utilizável — a UI mostra um aviso em vez de um link quebrado.
 */
export function whatsAppUrl(
  phone: string | null | undefined,
  message?: string,
  defaultDialCode: string = DEFAULT_DIAL_CODE,
): string | null {
  const { digits, valid } = normalizePhone(phone, defaultDialCode);
  if (!valid) return null;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
