export type PixelType =
  | "meta_pixel"
  | "meta_capi"
  | "gtm"
  | "ga4"
  | "google_ads"
  | "tiktok_pixel"
  | "utmify"
  | "custom_script";

export type PixelConnectionStatus =
  | "not_tested"
  | "connected"
  | "invalid_token"
  | "invalid_pixel"
  | "connection_error"
  | "disabled";

export const PIXEL_CONNECTION_STATUS_INFO: Record<
  PixelConnectionStatus,
  { label: string; badge: "muted" | "success" | "destructive" | "warning" }
> = {
  not_tested: { label: "Não testado", badge: "muted" },
  connected: { label: "Conectado", badge: "success" },
  invalid_token: { label: "Token inválido", badge: "destructive" },
  invalid_pixel: { label: "Pixel inválido", badge: "destructive" },
  connection_error: { label: "Erro de conexão", badge: "warning" },
  disabled: { label: "Desativado", badge: "muted" },
};

export interface PixelRow {
  id: string;
  name: string;
  type: PixelType;
  pixelId: string | null;
  isActive: boolean;
  hasToken: boolean;
  lastActivityAt: Date | null;
  landingPageId: string | null;
  tokenPreview: string | null;
  testEventCode: string | null;
  connectionStatus: PixelConnectionStatus;
  lastTestedAt: Date | null;
  lastTestError: string | null;
}

/** Regra efetiva de contagem de Purchase — resolvida a partir do global + override da landing page. */
export type PurchaseRule = "generated" | "approved";

export const PIXEL_TYPE_INFO: Record<
  PixelType,
  { label: string; idLabel: string; idPlaceholder: string; helper: string }
> = {
  meta_pixel: {
    label: "Meta Pixel (Facebook/Instagram)",
    idLabel: "ID do Pixel",
    idPlaceholder: "1234567890123456",
    helper:
      "Encontre em Gestor de Eventos da Meta → Fontes de dados → o seu pixel.",
  },
  meta_capi: {
    label: "Meta Conversions API",
    idLabel: "ID do Pixel",
    idPlaceholder: "1234567890123456",
    helper:
      "Usa o mesmo ID do pixel + token de acesso. Envia a compra pelo servidor, sem depender do navegador.",
  },
  ga4: {
    label: "Google Analytics 4",
    idLabel: "ID de medição",
    idPlaceholder: "G-XXXXXXXXXX",
    helper: "Admin → Fluxos de dados → o seu fluxo web.",
  },
  gtm: {
    label: "Google Tag Manager",
    idLabel: "ID do contentor",
    idPlaceholder: "GTM-XXXXXXX",
    helper: "Aparece no topo do painel do Tag Manager.",
  },
  google_ads: {
    label: "Google Ads",
    idLabel: "ID de conversão",
    idPlaceholder: "AW-XXXXXXXXX",
    helper: "Ferramentas → Conversões → Tag do Google.",
  },
  tiktok_pixel: {
    label: "TikTok Pixel",
    idLabel: "ID do Pixel",
    idPlaceholder: "CXXXXXXXXXXXXXXXXXXX",
    helper: "Gestor de Eventos do TikTok Ads.",
  },
  utmify: {
    label: "UTMify",
    idLabel: "Nome da credencial",
    idPlaceholder: "Ex.: Credencial principal",
    helper:
      'Só um nome livre para identificar aqui — a UTMify não usa um "ID de pixel", só o token abaixo.',
  },
  custom_script: {
    label: "Script personalizado",
    idLabel: "Identificador",
    idPlaceholder: "—",
    helper: "Disponível apenas para administradores.",
  },
};
