/**
 * Modelo de dados do construtor de landing pages.
 *
 * As propriedades de cada bloco ficam num objeto livre (`props`) em vez de
 * uma interface por tipo. Isso é deliberado: uma página publicada há meses
 * continua renderizando mesmo depois de o catálogo de blocos ganhar campos
 * novos — o renderer lê tudo por helpers que validam o tipo em execução e
 * caem num valor padrão quando o dado não existe ou veio errado.
 */

export const BLOCK_TYPES = [
  "announcement",
  "header",
  "logo",
  "menu",
  "hero",
  "gallery",
  "video",
  "heading",
  "text",
  "price",
  "offer",
  "variants",
  "stock",
  "quantity",
  "buy_button",
  "whatsapp",
  "benefits",
  "trust_badges",
  "description",
  "specs",
  "image_text",
  "features",
  "comparison",
  "reviews",
  "testimonials",
  "faq",
  "shipping",
  "guarantee",
  "form",
  "countdown",
  "footer",
  "custom_html",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type BlockVisibility = "all" | "desktop" | "mobile";

export interface BlockStyle {
  /** Cor de fundo (hex). Vazio = herda o fundo do tema. */
  background?: string;
  /** Cor do texto (hex). Vazio = herda o texto do tema. */
  textColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  align?: "left" | "center" | "right";
  animation?: "none" | "fade" | "rise";
  visibility?: BlockVisibility;
}

/** Valores aceitos dentro de `props` — o que sobrevive a `JSON.stringify`. */
export type BlockPropValue =
  | string
  | number
  | boolean
  | null
  | BlockPropValue[]
  | { [key: string]: BlockPropValue };

export interface LandingBlock {
  id: string;
  type: BlockType;
  /** Oculto no site publicado, mas preservado no editor */
  hidden?: boolean;
  /** Identificador usado em âncoras e no rastreamento de cliques */
  anchorId?: string;
  style?: BlockStyle;
  props: Record<string, BlockPropValue>;
}

export interface LandingContentDoc {
  blocks: LandingBlock[];
}

export interface LandingTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  headerBackground: string;
  headerTextColor: string;
  footerBackground: string;
  footerTextColor: string;
  variantSelectedColor: string;
  headingFont: string;
  bodyFont: string;
  radius: number;
  shadow: "none" | "soft" | "medium" | "strong";
  maxWidth: number;
  buttonStyle: "solid" | "outline" | "soft";
  colorScheme: "light" | "dark";
}

export interface LandingSeo {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  shareImageUrl: string;
  twitterCard: "summary" | "summary_large_image";
  noIndex: boolean;
  productSchema: boolean;
}

export interface LandingTracking {
  metaPixelId: string;
  tiktokPixelId: string;
  ga4MeasurementId: string;
  gtmContainerId: string;
  /** Parâmetros extras repassados ao checkout (ex.: `src=lp-verao`) */
  defaultUtm: string;
  /** Herdar os pixels configurados em /pixel além dos desta página */
  inheritWorkspacePixels: boolean;
  /**
   * Regra de Purchase da Meta específica desta página — `null` herda a
   * configuração global do workspace (`workspaces.settings`).
   */
  countGeneratedOrdersAsPurchase: boolean | null;
}

export interface LandingCustomCode {
  headCode: string;
  bodyStartCode: string;
  bodyEndCode: string;
  css: string;
  javascript: string;
}

/** Dados do produto usados pela página — do catálogo ou congelados. */
export interface LandingProductData {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  comparePriceCents: number | null;
  currency: string;
  mainImageUrl: string | null;
  gallery: string[];
  variants: LandingProductVariant[];
  /** Nome do atributo principal ("Cor"), usado como título do seletor */
  variantOptionName: string;
  trackInventory: boolean;
  stockQuantity: number;
  /** Slug do checkout publicado; vazio = usa o slug do produto */
  checkoutSlug: string;
}

export interface LandingProductVariant {
  id: string;
  /** Identificador usado em `?variant=` — nunca o UUID interno */
  publicId: string;
  name: string;
  priceCents: number | null;
  /** Preço anterior próprio da variação (riscado) */
  compareAtPriceCents: number | null;
  stockQuantity: number;
  trackInventory: boolean;
  allowBackorder: boolean;
  status: "active" | "sold_out" | "unavailable";
  sku: string | null;
  /** Ex.: `{ Cor: "Preto", Tamanho: "M" }` */
  attributes: Record<string, string>;
  imageUrl?: string;
  /** Miniatura real do card da opção */
  thumbnailUrl?: string;
  hexColor?: string;
  /** Galeria própria; vazia = usa a galeria geral do produto */
  gallery: string[];
  isDefault: boolean;
  weightGrams: number | null;
  purchaseLimit: number | null;
}

/**
 * Tudo o que a página pública precisa para renderizar. É exatamente o que
 * fica congelado em `landing_pages.published_snapshot` a cada publicação.
 */
export interface LandingSnapshot {
  version: number;
  publicName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  language: string;
  currency: string;
  content: LandingContentDoc;
  theme: LandingTheme;
  seo: LandingSeo;
  tracking: LandingTracking;
  customCode: LandingCustomCode;
  product: LandingProductData | null;
  /** ISO da publicação — usado no histórico e no cabeçalho de cache */
  publishedAt: string;
}

export type LandingStatus =
  "draft" | "published" | "paused" | "scheduled" | "error";

/**
 * Onde a página é servida.
 *
 * `infinity` é o caminho normal: a rota `/lp/[slug]` desta aplicação lê o
 * snapshot do banco e desenha a página. `vercel` é para as páginas cujo HTML
 * não nasce do editor — um site já exportado, por exemplo — e que por isso
 * vivem num projeto estático próprio; aqui o painel publica e regista, mas
 * quem serve o endereço é o outro projeto.
 */
export type LandingHostingProvider = "infinity" | "vercel";

/**
 * Fase do último envio para o serviço de hospedagem.
 *
 * Independente de `LandingStatus`: uma página pode continuar publicada no
 * painel com o último deploy em `failed`, e a interface precisa de mostrar
 * as duas coisas ao mesmo tempo em vez de escolher uma.
 */
export type LandingDeploymentStatus =
  | "idle"
  | "preparing"
  | "deploying"
  | "ready"
  | "failed";

export interface LandingDeployment {
  provider: LandingHostingProvider;
  status: LandingDeploymentStatus;
  url: string | null;
  projectId: string | null;
  deploymentId: string | null;
  /** Saída técnica do último envio, para diagnóstico quando falha */
  log: string | null;
  updatedAt: Date | null;
}

export const DEPLOYMENT_STATUS_LABEL: Record<LandingDeploymentStatus, string> = {
  idle: "Sem deploy",
  preparing: "Preparando",
  deploying: "Fazendo deploy",
  ready: "Publicado",
  failed: "Falhou",
};

export const HOSTING_PROVIDER_LABEL: Record<LandingHostingProvider, string> = {
  infinity: "Infinity",
  vercel: "Vercel",
};

/** Normaliza o que veio do banco, que é texto livre. */
export function asHostingProvider(value: unknown): LandingHostingProvider {
  return value === "vercel" ? "vercel" : "infinity";
}

export function asDeploymentStatus(value: unknown): LandingDeploymentStatus {
  const allowed: LandingDeploymentStatus[] = [
    "idle",
    "preparing",
    "deploying",
    "ready",
    "failed",
  ];
  return allowed.includes(value as LandingDeploymentStatus)
    ? (value as LandingDeploymentStatus)
    : "idle";
}

// ---------------------------------------------------------------------------
// Leitura segura de `props`
// ---------------------------------------------------------------------------

export function propText(
  props: Record<string, BlockPropValue>,
  key: string,
  fallback = "",
): string {
  const value = props[key];
  return typeof value === "string" ? value : fallback;
}

export function propNumber(
  props: Record<string, BlockPropValue>,
  key: string,
  fallback = 0,
): number {
  const value = props[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function propBool(
  props: Record<string, BlockPropValue>,
  key: string,
  fallback = false,
): boolean {
  const value = props[key];
  return typeof value === "boolean" ? value : fallback;
}

/** Lista de textos (uma linha por item no editor). */
export function propList(
  props: Record<string, BlockPropValue>,
  key: string,
): string[] {
  const value = props[key];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

/** Lista de pares `rótulo | valor` (uma linha por item). */
export function propPairs(
  props: Record<string, BlockPropValue>,
  key: string,
): [string, string][] {
  return propList(props, key).map((line) => {
    const [left, ...rest] = line.split("|");
    return [left.trim(), rest.join("|").trim()] as [string, string];
  });
}
