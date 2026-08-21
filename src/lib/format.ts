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
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeZone: timeZoneFor(locale),
  }).format(d);
}

export function formatDateTime(
  date: Date | string,
  locale: string = "pt-BR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    // A renderização inicial acontece no servidor e depois hidrata no
    // navegador. Um fuso explícito impede que os dois lados produzam textos
    // diferentes (e o React reporte erro de hidratação em produção).
    timeZone: timeZoneFor(locale),
  }).format(d);
}

function timeZoneFor(locale: string): string {
  if (locale.toLowerCase().startsWith("pt-pt")) return "Europe/Lisbon";
  if (locale.toLowerCase().startsWith("pt-br")) return "America/Sao_Paulo";
  return "UTC";
}
