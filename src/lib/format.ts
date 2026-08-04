/**
 * Formatadores compartilhados. Valores monetários são armazenados em
 * centavos (bigint no banco) e formatados apenas na borda da UI.
 */

export function formatMoney(
  cents: number | bigint,
  currency: string = "BRL",
  locale: string = "pt-BR",
): string {
  const value = Number(cents) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    value,
  );
}

export function formatNumber(value: number, locale: string = "pt-BR"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(value: number, locale: string = "pt-BR"): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(
  date: Date | string,
  locale: string = "pt-BR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(d);
}

export function formatDateTime(
  date: Date | string,
  locale: string = "pt-BR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
