import type {
  LandingContentDoc,
  LandingCustomCode,
  LandingSeo,
  LandingTheme,
  LandingTracking,
} from "./types";

/** Rosa do Infinity — mesma família de cor da identidade do painel. */
export const INFINITY_PINK = "#E5097F";

export const DEFAULT_THEME: LandingTheme = {
  primaryColor: INFINITY_PINK,
  secondaryColor: "#7C3AED",
  backgroundColor: "#FFFFFF",
  textColor: "#18181B",
  buttonColor: INFINITY_PINK,
  buttonTextColor: "#FFFFFF",
  headerBackground: "#0A0A0A",
  headerTextColor: "#FFFFFF",
  footerBackground: "#0A0A0A",
  footerTextColor: "#FFFFFF",
  variantSelectedColor: INFINITY_PINK,
  headingFont: "Inter",
  bodyFont: "Inter",
  radius: 12,
  shadow: "soft",
  maxWidth: 1120,
  buttonStyle: "solid",
  colorScheme: "light",
};

export const DEFAULT_SEO: LandingSeo = {
  title: "",
  description: "",
  keywords: "",
  canonicalUrl: "",
  shareImageUrl: "",
  twitterCard: "summary_large_image",
  noIndex: false,
  productSchema: true,
};

export const DEFAULT_TRACKING: LandingTracking = {
  metaPixelId: "",
  tiktokPixelId: "",
  ga4MeasurementId: "",
  gtmContainerId: "",
  defaultUtm: "",
  inheritWorkspacePixels: true,
  countGeneratedOrdersAsPurchase: null,
};

export const DEFAULT_CUSTOM_CODE: LandingCustomCode = {
  headCode: "",
  bodyStartCode: "",
  bodyEndCode: "",
  css: "",
  javascript: "",
};

export const EMPTY_CONTENT: LandingContentDoc = { blocks: [] };

/** Fontes disponíveis no seletor de tipografia (todas com fallback do sistema). */
export const FONT_OPTIONS = [
  { value: "Inter", label: "Inter (padrão)" },
  { value: "system-ui", label: "Sistema" },
  { value: "Georgia", label: "Georgia (serifada)" },
  { value: "'Times New Roman'", label: "Times New Roman" },
  { value: "'Trebuchet MS'", label: "Trebuchet" },
  { value: "Verdana", label: "Verdana" },
] as const;

export const SHADOW_OPTIONS = [
  { value: "none", label: "Sem sombra" },
  { value: "soft", label: "Suave" },
  { value: "medium", label: "Média" },
  { value: "strong", label: "Forte" },
] as const;

export const BUTTON_STYLE_OPTIONS = [
  { value: "solid", label: "Preenchido" },
  { value: "outline", label: "Contornado" },
  { value: "soft", label: "Suave" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "es-ES", label: "Espanhol" },
  { value: "en-US", label: "Inglês" },
] as const;

export const COUNTRY_OPTIONS = [
  { value: "PT", label: "Portugal" },
  { value: "BR", label: "Brasil" },
  { value: "ES", label: "Espanha" },
  { value: "US", label: "Estados Unidos" },
] as const;

export const CURRENCY_OPTIONS = [
  { value: "EUR", label: "Euro (€)" },
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar ($)" },
] as const;

/** Mescla o que veio do banco com os padrões — campo ausente nunca quebra. */
export function withThemeDefaults(raw: unknown): LandingTheme {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_THEME };
  return { ...DEFAULT_THEME, ...(raw as Partial<LandingTheme>) };
}

export function withSeoDefaults(raw: unknown): LandingSeo {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SEO };
  return { ...DEFAULT_SEO, ...(raw as Partial<LandingSeo>) };
}

export function withTrackingDefaults(raw: unknown): LandingTracking {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TRACKING };
  return { ...DEFAULT_TRACKING, ...(raw as Partial<LandingTracking>) };
}

export function withCustomCodeDefaults(raw: unknown): LandingCustomCode {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CUSTOM_CODE };
  return { ...DEFAULT_CUSTOM_CODE, ...(raw as Partial<LandingCustomCode>) };
}

export function withContentDefaults(raw: unknown): LandingContentDoc {
  if (!raw || typeof raw !== "object") return { blocks: [] };
  const blocks = (raw as LandingContentDoc).blocks;
  return { blocks: Array.isArray(blocks) ? blocks : [] };
}
