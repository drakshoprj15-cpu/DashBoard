/**
 * Validação de documento fiscal do cliente (CPF/NIF/genérico
 * internacional). Usado no checkout público — nunca bloqueia a compra
 * (o campo é opcional), só valida o formato quando preenchido.
 */

/** NIF português: 9 dígitos com dígito de controlo (algoritmo oficial). */
export function isValidPtNif(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  // Sequências repetidas (000000000, 111111111, ...) passam no cálculo do
  // dígito verificador mas nunca são NIFs válidos.
  if (/^(\d)\1{8}$/.test(digits)) return false;

  const nums = digits.split("").map(Number);
  const sum = nums.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === nums[8];
}

/** CPF brasileiro: 11 dígitos com dois dígitos verificadores (algoritmo oficial). */
export function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  // Sequências repetidas (000.000.000-00, 111.111.111-11, ...) passam no
  // cálculo do dígito verificador mas nunca são CPFs válidos.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const nums = digits.split("").map(Number);
  const checkDigit = (base: number[]): number => {
    let sum = 0;
    let weight = base.length + 1;
    for (const d of base) {
      sum += d * weight;
      weight -= 1;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = checkDigit(nums.slice(0, 9));
  const d2 = checkDigit(nums.slice(0, 10));
  return d1 === nums[9] && d2 === nums[10];
}

/**
 * Valida um documento fiscal pelo país do cliente. Países sem algoritmo de
 * checksum conhecido caem numa validação genérica (só formato) — nunca
 * inventa uma regra de checksum que não existe.
 */
export function isValidDocument(raw: string, country: string | null | undefined): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  switch ((country ?? "").toUpperCase()) {
    case "PT":
      return isValidPtNif(trimmed);
    case "BR":
      return isValidCpf(trimmed);
    default:
      return /^[a-zA-Z0-9.\-/ ]{5,20}$/.test(trimmed);
  }
}
