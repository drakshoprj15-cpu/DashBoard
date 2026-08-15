export const ATTRIBUTION_COOKIE = "infinity_attribution_session";

export const UTMIFY_TRACKING_KEYS = [
  "src",
  "sck",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
  "utm_term",
] as const;

export type UtmifyTrackingKey = (typeof UTMIFY_TRACKING_KEYS)[number];
export type UtmAttribution = Partial<Record<UtmifyTrackingKey, string>> & {
  lp?: string;
};

const MAX_VALUE_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export function sanitizeAttributionValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = value
    .replace(CONTROL_CHARACTERS, "")
    .trim()
    .slice(0, MAX_VALUE_LENGTH);
  return sanitized || undefined;
}

/** Mantém somente os parâmetros suportados e nunca devolve valores vazios. */
export function sanitizeAttribution(
  input: Record<string, unknown> | null | undefined,
): UtmAttribution {
  const result: UtmAttribution = {};
  for (const key of UTMIFY_TRACKING_KEYS) {
    const value = sanitizeAttributionValue(input?.[key]);
    if (value) result[key] = value;
  }
  const landingPageId = sanitizeAttributionValue(input?.lp);
  if (landingPageId) result.lp = landingPageId.slice(0, 64);
  return result;
}

/** Uma navegação sem UTM nunca apaga uma atribuição já registrada. */
export function mergeAttribution(
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): UtmAttribution {
  return {
    ...sanitizeAttribution(current),
    ...sanitizeAttribution(incoming),
  };
}

export function toUtmifyTrackingParameters(
  input: Record<string, unknown> | null | undefined,
): Record<UtmifyTrackingKey, string | null> {
  const utm = sanitizeAttribution(input);
  return Object.fromEntries(
    UTMIFY_TRACKING_KEYS.map((key) => [key, utm[key] ?? null]),
  ) as Record<UtmifyTrackingKey, string | null>;
}
