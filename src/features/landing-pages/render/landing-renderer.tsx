"use client";

import * as React from "react";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  MessageCircle,
  Plus,
  ShieldCheck,
  Star,
  Truck,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { PublicReview } from "@/features/reviews/queries";
import { STANDARD_STOREFRONT } from "@/features/storefront/standard-brand";
import { buildPriceView, isPurchasable } from "@/features/variants/pricing";

import {
  propBool,
  propList,
  propNumber,
  propPairs,
  propText,
  type LandingBlock,
  type LandingProductData,
  type LandingProductVariant,
  type LandingSnapshot,
} from "../types";
import { sanitizeHtml } from "../sanitize";
import {
  animationClass,
  blockStyleToCss,
  buttonStyle,
  LANDING_BASE_CSS,
  themeToCssVars,
  visibilityClass,
} from "./theme";

export type RenderMode = "public" | "editor";

interface RuntimeValue {
  mode: RenderMode;
  pageId: string;
  snapshot: LandingSnapshot;
  product: LandingProductData | null;
  reviews: PublicReview[];
  locale: string;
  quantity: number;
  setQuantity: (value: number) => void;
  variantId: string | null;
  setVariantId: (value: string) => void;
  /** Variação escolhida agora — fonte de imagem, preço, estoque e SKU */
  variant: LandingProductVariant | null;
  track: (event: TrackableEvent, extra?: Record<string, unknown>) => void;
  money: (cents: number) => string;
  checkoutHref: () => string;
  /** Preço atual considerando a variação escolhida */
  currentPriceCents: number;
  /** Preço anterior da variação (ou do produto, quando não há variação) */
  currentCompareAtCents: number | null;
  /** Galeria da variação; cai na do produto quando ela não tem fotos */
  currentGallery: string[];
  /** Estoque da variação; `null` quando não há contagem a mostrar */
  currentStock: number | null;
  /** A opção escolhida pode ser comprada agora? */
  canBuy: boolean;
}

type TrackableEvent =
  | "page_view"
  | "view_content"
  | "select_variant"
  | "cta_click"
  | "add_to_cart"
  | "initiate_checkout"
  | "lead";

const RuntimeContext = React.createContext<RuntimeValue | null>(null);

function useRuntime(): RuntimeValue {
  const value = React.useContext(RuntimeContext);
  if (!value) throw new Error("Bloco renderizado fora da landing page.");
  return value;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Parâmetros de campanha da URL atual, repassados ao checkout. */
function collectForwardParams(): URLSearchParams {
  const forwarded = new URLSearchParams();
  if (typeof window === "undefined") return forwarded;

  const current = new URLSearchParams(window.location.search);
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "src",
    "sck",
    "fbclid",
    "gclid",
    "ttclid",
  ]) {
    const value = current.get(key);
    if (value) forwarded.set(key, value.slice(0, 200));
  }
  return forwarded;
}

/**
 * Variação que abre selecionada.
 *
 * Prioridade: a pedida na URL (`?variant=preto`, resolvida no servidor para
 * a página já sair pronta), depois a padrão do catálogo, depois a primeira
 * que dá para comprar, e por fim a primeira da lista — assim a página mostra
 * o card esgotado em vez de abrir sem seleção nenhuma.
 *
 * Identificador inválido ou variação desativada cai silenciosamente na
 * padrão: um link velho de anúncio não pode abrir uma opção fora do ar.
 */
function pickInitialVariant(
  product: LandingProductData | null,
  requestedPublicId?: string,
): LandingProductVariant | null {
  if (!product || product.variants.length === 0) return null;

  const requested = requestedPublicId?.trim();
  const fromUrl = requested
    ? product.variants.find(
        (item) => item.publicId === requested && isPurchasable(item),
      )
    : undefined;

  return (
    fromUrl ??
    product.variants.find((item) => item.isDefault && isPurchasable(item)) ??
    product.variants.find((item) => isPurchasable(item)) ??
    product.variants[0]
  );
}

function anonymousId(): string {
  try {
    const key = "infinity:aid";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/** Converte um endereço de vídeo em URL de incorporação. */
function toEmbedUrl(
  url: string,
): { kind: "iframe" | "video"; src: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const youtube = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/,
  );
  if (youtube) {
    return {
      kind: "iframe",
      src: `https://www.youtube-nocookie.com/embed/${youtube[1]}`,
    };
  }

  const vimeo = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return {
      kind: "iframe",
      src: `https://player.vimeo.com/video/${vimeo[1]}`,
    };
  }

  if (
    /^https?:\/\//i.test(trimmed) &&
    /\.(mp4|webm|ogg)(\?|$)/i.test(trimmed)
  ) {
    return { kind: "video", src: trimmed };
  }

  return null;
}

function Section({
  block,
  children,
  className,
  fullWidth = false,
}: {
  block: LandingBlock;
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <section
      id={block.anchorId || undefined}
      data-block-type={block.type}
      className={cn(
        "px-4",
        visibilityClass(block.style),
        animationClass(block.style),
        className,
      )}
      style={{
        paddingTop: 32,
        paddingBottom: 32,
        ...blockStyleToCss(block.style),
      }}
    >
      <div
        className={cn("mx-auto w-full", fullWidth ? "max-w-none" : undefined)}
        style={fullWidth ? undefined : { maxWidth: "var(--lp-max-width)" }}
      >
        {children}
      </div>
    </section>
  );
}

function Heading({
  children,
  level = "h2",
  className,
}: {
  children: React.ReactNode;
  level?: "h2" | "h3";
  className?: string;
}) {
  const Tag = level;
  return (
    <Tag
      className={cn(
        level === "h2" ? "text-2xl font-bold md:text-3xl" : "text-xl font-bold",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* eslint-disable @next/next/no-img-element -- as imagens vêm de endereços
   arbitrários escolhidos pelo lojista; o next/image exigiria listar cada
   domínio em next.config.ts e quebraria a página com um erro em produção. */
function Img({
  src,
  alt,
  className,
  priority = false,
  style,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}
/* eslint-enable @next/next/no-img-element */

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

function AnnouncementBlock({ block }: { block: LandingBlock }) {
  const [dismissed, setDismissed] = React.useState(false);
  const text = propText(block.props, "text");
  const linkUrl = propText(block.props, "linkUrl");
  const dismissible = propBool(block.props, "dismissible", true);

  if (!text || dismissed) return null;

  const content = linkUrl ? (
    <a href={linkUrl} className="underline underline-offset-2">
      {text}
    </a>
  ) : (
    text
  );

  return (
    <div
      className={cn(
        "relative px-10 py-2.5 text-center text-sm font-medium",
        visibilityClass(block.style),
      )}
      style={{
        backgroundColor: "var(--lp-primary)",
        color: "#fff",
        ...blockStyleToCss(block.style),
      }}
    >
      {content}
      {dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fechar aviso"
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 opacity-80 hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function StandardLandingHeader() {
  const { product } = useRuntime();
  return (
    <header
      className="z-30 flex min-h-20 items-center justify-center px-4 py-5 md:min-h-24 md:py-6"
      style={{ backgroundColor: STANDARD_STOREFRONT.headerBackground }}
    >
      <a
        href={product ? `/p/${product.slug}` : "#comprar"}
        className="flex items-center justify-center"
        aria-label={STANDARD_STOREFRONT.name}
      >
        <Img
          src={STANDARD_STOREFRONT.logoUrl}
          alt={STANDARD_STOREFRONT.name}
          priority
          className="h-9 w-auto max-w-[220px] object-contain md:h-11"
        />
      </a>
    </header>
  );
}

function LogoBlock({ block }: { block: LandingBlock }) {
  const { snapshot } = useRuntime();
  const src = propText(block.props, "imageUrl") || snapshot.logoUrl || "";
  const height = propNumber(block.props, "height", 48);

  return (
    <Section block={block}>
      <div className="flex justify-center">
        {src ? (
          <Img
            src={src}
            alt={snapshot.publicName}
            className="object-contain"
            style={{ height }}
          />
        ) : (
          <span className="text-xl font-black">{snapshot.publicName}</span>
        )}
      </div>
    </Section>
  );
}

function MenuBlock({ block }: { block: LandingBlock }) {
  const items = propPairs(block.props, "items");
  const sticky = propBool(block.props, "sticky");
  if (items.length === 0) return null;

  return (
    <nav
      className={cn(
        "z-20 border-y px-4 py-3",
        sticky && "sticky top-0",
        visibilityClass(block.style),
      )}
      style={{
        borderColor: "var(--lp-border)",
        backgroundColor: "var(--lp-bg)",
        ...blockStyleToCss(block.style),
      }}
    >
      <div
        className="mx-auto flex w-full flex-wrap justify-center gap-6 text-sm font-medium"
        style={{ maxWidth: "var(--lp-max-width)" }}
      >
        {items.map(([label, href], index) => (
          <a
            key={`${label}-${index}`}
            href={href || "#"}
            className="hover:opacity-70"
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function HeroBlock({ block }: { block: LandingBlock }) {
  const { product, snapshot } = useRuntime();
  const layout = propText(block.props, "layout", "image-right");
  const title = propText(block.props, "title") || product?.name || "";
  const subtitle =
    propText(block.props, "subtitle") || product?.shortDescription || "";
  const image =
    propText(block.props, "imageUrl") || product?.mainImageUrl || "";
  const eyebrow = propText(block.props, "eyebrow");
  const ctaLabel = propText(block.props, "ctaLabel");
  const ctaTarget = propText(block.props, "ctaTarget", "#comprar");

  const text = (
    <div className={layout === "centered" ? "text-center" : undefined}>
      {eyebrow ? (
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-bold"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--lp-primary) 14%, transparent)",
            color: "var(--lp-primary)",
          }}
        >
          {eyebrow}
        </span>
      ) : null}
      <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
        {title}
      </h1>
      {subtitle ? (
        <p
          className="mt-4 text-base md:text-lg"
          style={{ color: "var(--lp-muted)" }}
        >
          {subtitle}
        </p>
      ) : null}
      {ctaLabel ? (
        <div
          className={cn("mt-6", layout === "centered" && "flex justify-center")}
        >
          <a
            href={ctaTarget || "#comprar"}
            className="inline-flex min-h-12 items-center px-7 text-base"
            style={buttonStyle(snapshot.theme)}
          >
            {ctaLabel}
          </a>
        </div>
      ) : null}
    </div>
  );

  const picture = image ? (
    <Img
      src={image}
      alt={title}
      priority
      className="w-full object-contain"
      style={{
        borderRadius: "var(--lp-radius)",
        boxShadow: "var(--lp-shadow)",
      }}
    />
  ) : null;

  if (layout === "centered") {
    return (
      <Section block={block}>
        <div className="mx-auto max-w-3xl">{text}</div>
        {picture ? <div className="mt-8">{picture}</div> : null}
      </Section>
    );
  }

  return (
    <Section block={block}>
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        {layout === "image-left" ? (
          <>
            <div>{picture}</div>
            {text}
          </>
        ) : (
          <>
            {text}
            <div>{picture}</div>
          </>
        )}
      </div>
    </Section>
  );
}

function GalleryBlock({ block }: { block: LandingBlock }) {
  const { product, currentGallery, variant } = useRuntime();
  const custom = propList(block.props, "images");
  // Galeria fixa no bloco tem prioridade; sem ela, manda a variação escolhida.
  const images = custom.length > 0 ? custom : currentGallery;
  const layout = propText(block.props, "layout", "thumbs");
  const touchStartX = React.useRef<number | null>(null);

  /**
   * A foto aberta é guardada junto da variação a que pertence. Trocar de cor
   * volta sozinho para a primeira imagem da nova galeria (continuar na
   * terceira foto de outra cor mostraria o produto errado) — sem efeito de
   * sincronização, que causaria um render a mais a cada clique.
   */
  const variantKey = variant?.id ?? "";
  const [view, setView] = React.useState({
    key: variantKey,
    index: 0,
    zoomed: false,
  });
  const active = view.key === variantKey ? view.index : 0;
  const zoomed = view.key === variantKey ? view.zoomed : false;

  const setActive = (next: number | ((current: number) => number)) =>
    setView((current) => {
      const base = current.key === variantKey ? current.index : 0;
      return {
        key: variantKey,
        index: typeof next === "function" ? next(base) : next,
        zoomed: false,
      };
    });

  const toggleZoom = () =>
    setView((current) => ({
      key: variantKey,
      index: current.key === variantKey ? current.index : 0,
      zoomed: current.key === variantKey ? !current.zoomed : true,
    }));

  if (images.length === 0) return null;

  const altText = variant
    ? `${product?.name ?? "Produto"} — ${variant.name}`
    : (product?.name ?? "Imagem do produto");

  if (layout === "grid") {
    return (
      <Section block={block}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((src, index) => (
            <Img
              key={`${src}-${index}`}
              src={src}
              alt={`${altText} — imagem ${index + 1}`}
              priority={index === 0}
              className="aspect-square w-full bg-white object-contain"
              style={{
                borderRadius: "var(--lp-radius)",
                border: "1px solid var(--lp-border)",
              }}
            />
          ))}
        </div>
      </Section>
    );
  }

  const index = Math.min(active, images.length - 1);
  const current = images[index];
  const step = (direction: -1 | 1) =>
    setActive((value) => (value + direction + images.length) % images.length);

  return (
    <Section block={block}>
      <div
        className="relative overflow-hidden bg-white"
        style={{
          borderRadius: "var(--lp-radius)",
          border: "1px solid var(--lp-border)",
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          const end = event.changedTouches[0]?.clientX ?? null;
          touchStartX.current = null;
          if (start === null || end === null || images.length < 2) return;
          // Arrasto curto é toque, não gesto: 40px evita trocar sem querer.
          if (Math.abs(end - start) < 40) return;
          step(end < start ? 1 : -1);
        }}
      >
        <Img
          src={current}
          alt={`${altText} — imagem ${index + 1} de ${images.length}`}
          priority
          className={cn(
            "aspect-square w-full object-contain transition-transform duration-200",
            zoomed && "scale-150",
            propBool(block.props, "allowZoom", true) && "cursor-zoom-in",
          )}
          onClick={
            propBool(block.props, "allowZoom", true) ? toggleZoom : undefined
          }
        />

        {images.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Imagem anterior"
              onClick={() => step(-1)}
              className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border bg-white/90 text-zinc-800"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Próxima imagem"
              onClick={() => step(1)}
              className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border bg-white/90 text-zinc-800"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((src, position) => (
            <button
              key={`${src}-${position}`}
              type="button"
              onClick={() => setActive(position)}
              aria-label={`Ver imagem ${position + 1}`}
              aria-current={position === index}
              className="overflow-hidden bg-white p-0"
              style={{
                borderRadius: "calc(var(--lp-radius) * .6)",
                border:
                  position === index
                    ? "2px solid var(--lp-primary)"
                    : "1px solid var(--lp-border)",
              }}
            >
              <Img src={src} alt="" className="size-16 object-contain" />
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function VideoBlock({ block }: { block: LandingBlock }) {
  const embed = toEmbedUrl(propText(block.props, "url"));
  const title = propText(block.props, "title", "Vídeo");
  if (!embed) return null;

  return (
    <Section block={block}>
      <div
        className="overflow-hidden"
        style={{
          borderRadius: "var(--lp-radius)",
          boxShadow: "var(--lp-shadow)",
        }}
      >
        {embed.kind === "iframe" ? (
          <iframe
            src={embed.src}
            title={title}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="aspect-video w-full border-0"
          />
        ) : (
          <video
            src={embed.src}
            poster={propText(block.props, "posterUrl") || undefined}
            controls
            preload="none"
            className="aspect-video w-full"
          >
            <track kind="captions" />
          </video>
        )}
      </div>
    </Section>
  );
}

function HeadingBlock({ block }: { block: LandingBlock }) {
  const text = propText(block.props, "text");
  const { product } = useRuntime();
  const resolved = text || product?.name || "";
  if (!resolved) return null;

  return (
    <Section block={block}>
      <Heading
        level={propText(block.props, "level", "h2") === "h3" ? "h3" : "h2"}
      >
        {resolved}
      </Heading>
    </Section>
  );
}

function TextBlock({ block }: { block: LandingBlock }) {
  const body = propText(block.props, "body");
  if (!body.trim()) return null;

  return (
    <Section block={block}>
      <div className="space-y-4 text-base leading-relaxed">
        {body.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}

/**
 * Preço da opção escolhida.
 *
 * Preço, riscado, percentual e economia saem todos do mesmo cálculo
 * (`buildPriceView`), o mesmo que o painel e o checkout usam. Não há como a
 * página mostrar "-65%" e o servidor cobrar outra conta.
 */
function PriceBlock({ block }: { block: LandingBlock }) {
  const { product, money, currentPriceCents, currentCompareAtCents, variant } =
    useRuntime();
  if (!product) return null;

  const price = buildPriceView(currentPriceCents, currentCompareAtCents);
  const showCompare =
    propBool(block.props, "showCompare", true) && price.showCompareAt;

  return (
    <Section block={block}>
      <div className="flex flex-wrap items-baseline gap-3" aria-live="polite">
        <span className="text-4xl font-black tracking-tight">
          {money(price.priceCents)}
        </span>
        {showCompare ? (
          <span
            className="text-lg line-through"
            style={{ color: "var(--lp-muted)" }}
          >
            {money(price.compareAtPriceCents as number)}
          </span>
        ) : null}
        {propBool(block.props, "showDiscount", true) &&
        price.discountPercent ? (
          <span
            className="px-2 py-0.5 text-sm font-bold"
            style={{
              borderRadius: "calc(var(--lp-radius) * .5)",
              backgroundColor:
                "color-mix(in srgb, var(--lp-primary) 14%, transparent)",
              color: "var(--lp-primary)",
            }}
          >
            -{price.discountPercent}%
          </span>
        ) : null}
      </div>
      {propBool(block.props, "showSavings", true) && price.savingsCents > 0 ? (
        <p
          className="mt-1 font-semibold"
          style={{ color: "var(--lp-primary)" }}
        >
          Está a poupar {money(price.savingsCents)}
        </p>
      ) : null}
      {propBool(block.props, "showSku", false) && variant?.sku ? (
        <p
          className="mt-1 font-mono text-xs"
          style={{ color: "var(--lp-muted)" }}
        >
          SKU {variant.sku}
        </p>
      ) : null}
      {propText(block.props, "note") ? (
        <p className="mt-1 text-sm" style={{ color: "var(--lp-muted)" }}>
          {propText(block.props, "note")}
        </p>
      ) : null}
    </Section>
  );
}

function OfferBlock({ block }: { block: LandingBlock }) {
  const badge = propText(block.props, "badge");
  const title = propText(block.props, "title");
  const description = propText(block.props, "description");
  if (!title && !description) return null;

  return (
    <Section block={block}>
      <div
        className="p-6"
        style={{
          borderRadius: "var(--lp-radius)",
          border: "2px dashed var(--lp-primary)",
          backgroundColor:
            "color-mix(in srgb, var(--lp-primary) 6%, transparent)",
        }}
      >
        {badge ? (
          <span
            className="inline-block px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: "var(--lp-primary)", borderRadius: 999 }}
          >
            {badge}
          </span>
        ) : null}
        {title ? <h2 className="mt-3 text-xl font-bold">{title}</h2> : null}
        {description ? (
          <p className="mt-2 text-base" style={{ color: "var(--lp-muted)" }}>
            {description}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * Seletor de variações ("Escolha uma opção" / "Cor").
 *
 * É um `radiogroup` de verdade: setas navegam entre as opções, Espaço e
 * Enter escolhem, e o estado vai em `aria-checked` — leitores de tela
 * anunciam a cor escolhida, o preço e o "esgotado".
 */
function VariantsBlock({ block }: { block: LandingBlock }) {
  const { product, variantId, setVariantId, money } = useRuntime();
  const all = product?.variants ?? [];
  const hideSoldOut = propBool(block.props, "hideSoldOut", false);
  const variants = hideSoldOut
    ? all.filter((item) => isPurchasable(item))
    : all;
  const listRef = React.useRef<HTMLDivElement>(null);

  if (variants.length === 0) return null;

  const style = propText(block.props, "style", "cards");
  const label =
    propText(block.props, "label") ||
    product?.variantOptionName ||
    "Escolha uma opção";
  const showPrice = propBool(block.props, "showPrice", true);
  const showThumbnail = propBool(block.props, "showThumbnail", true);
  const columns = Math.min(
    6,
    Math.max(1, propNumber(block.props, "columns", 3)),
  );
  const size = propText(block.props, "size", "medium");

  /** Setas percorrem apenas as opções que dá para escolher. */
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const total = variants.length;

    for (let offset = 1; offset <= total; offset += 1) {
      const nextIndex = (((index + step * offset) % total) + total) % total;
      const next = variants[nextIndex];
      if (!next || !isPurchasable(next)) continue;
      setVariantId(next.id);
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-variant-option]",
      );
      buttons?.[nextIndex]?.focus();
      return;
    }
  }

  const isCircle = style === "circles";
  const isThumb = style === "thumbs";

  return (
    <Section block={block}>
      <p className="text-sm font-semibold">{label}</p>
      <div
        ref={listRef}
        role="radiogroup"
        aria-label={label}
        className={cn(
          "mt-3 gap-2",
          style === "list" ? "flex flex-col" : "flex flex-wrap",
          style === "cards" && "grid",
        )}
        style={
          style === "cards"
            ? {
                display: "grid",
                gridTemplateColumns: `repeat(auto-fit, minmax(${
                  size === "small" ? 110 : size === "large" ? 190 : 150
                }px, 1fr))`,
                maxWidth: columns * 200,
              }
            : undefined
        }
      >
        {variants.map((variant, index) => {
          const selected = variant.id === variantId;
          const available = isPurchasable(variant);
          const price = variant.priceCents ?? product?.priceCents ?? 0;
          const thumbnail = variant.thumbnailUrl ?? variant.imageUrl;

          return (
            <button
              key={variant.id}
              data-variant-option
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={!available}
              tabIndex={selected ? 0 : -1}
              disabled={!available}
              onClick={() => setVariantId(variant.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              title={variant.name}
              className={cn(
                "relative flex items-center gap-2 transition-colors",
                isCircle
                  ? "size-11 justify-center rounded-full p-0"
                  : "min-h-11 px-3 py-2",
                style === "cards" && "flex-col items-start text-left",
                style === "list" && "w-full text-left",
                !available && "cursor-not-allowed opacity-45",
              )}
              style={{
                borderRadius: isCircle ? 999 : "calc(var(--lp-radius) * .7)",
                border: selected
                  ? "2px solid var(--lp-variant-selected)"
                  : "1px solid var(--lp-border)",
                backgroundColor: selected
                  ? "color-mix(in srgb, var(--lp-variant-selected) 8%, transparent)"
                  : undefined,
              }}
            >
              {isCircle ? (
                <span
                  aria-hidden
                  className="size-7 rounded-full border"
                  style={{
                    backgroundColor: variant.hexColor ?? "var(--lp-border)",
                    backgroundImage: thumbnail
                      ? `url(${thumbnail})`
                      : undefined,
                    backgroundSize: "cover",
                  }}
                />
              ) : null}

              {!isCircle && showThumbnail && thumbnail ? (
                <Img
                  src={thumbnail}
                  alt=""
                  className={cn(
                    "shrink-0 bg-white object-contain",
                    isThumb || style === "cards" ? "h-16 w-full" : "size-9",
                  )}
                  style={{ borderRadius: "calc(var(--lp-radius) * .5)" }}
                />
              ) : null}

              {!isCircle && !showThumbnail && variant.hexColor ? (
                <span
                  aria-hidden
                  className="size-5 shrink-0 rounded-full border"
                  style={{ backgroundColor: variant.hexColor }}
                />
              ) : null}

              {!isCircle ? (
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {variant.name}
                  </span>
                  {showPrice ? (
                    <span className="block text-xs opacity-75">
                      {available ? money(price) : "Esgotado"}
                      {available &&
                      variant.compareAtPriceCents &&
                      variant.compareAtPriceCents > price ? (
                        <span className="ml-1.5 line-through opacity-70">
                          {money(variant.compareAtPriceCents)}
                        </span>
                      ) : null}
                    </span>
                  ) : !available ? (
                    <span className="block text-xs opacity-75">Esgotado</span>
                  ) : null}
                </span>
              ) : null}

              {/* Leitores de tela: a mesma informação do card visual. */}
              <span className="sr-only">
                {variant.name}
                {available ? `, ${money(price)}` : ", esgotado"}
                {selected ? ", selecionado" : ""}
              </span>

              {isCircle && !available ? (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center text-xs"
                >
                  <X className="size-4" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * Disponibilidade da opção escolhida.
 *
 * Mostra só o estoque real gravado no catálogo. Sem controlo de estoque
 * ligado, o bloco não aparece — nenhuma contagem é inventada para criar
 * urgência.
 */
function StockBlock({ block }: { block: LandingBlock }) {
  const { currentStock, canBuy, variant } = useRuntime();

  if (currentStock === null) {
    return canBuy ? null : (
      <Section block={block}>
        <p className="text-sm font-semibold" style={{ color: "#DC2626" }}>
          {propText(
            block.props,
            "soldOutLabel",
            "Opção indisponível de momento",
          )}
        </p>
      </Section>
    );
  }

  const label = propText(block.props, "label", "Em estoque");
  const showBar = propBool(block.props, "showBar", true);
  const barBase = Math.max(
    currentStock,
    propNumber(block.props, "barBase", 20),
  );
  const percent = Math.min(100, Math.round((currentStock / barBase) * 100));

  return (
    <Section block={block}>
      {currentStock <= 0 && !canBuy ? (
        <p className="text-sm font-semibold" style={{ color: "#DC2626" }}>
          {propText(block.props, "soldOutLabel", "Esgotado")}
          {variant ? ` — ${variant.name}` : ""}
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold">
            {label}: {currentStock} unidade{currentStock === 1 ? "" : "s"}
            {variant ? ` de ${variant.name}` : ""}
          </p>
          {showBar ? (
            <div
              className="mt-2 h-2 w-full overflow-hidden"
              style={{ backgroundColor: "var(--lp-border)", borderRadius: 999 }}
              role="progressbar"
              aria-valuenow={currentStock}
              aria-valuemin={0}
              aria-valuemax={barBase}
              aria-label={`${label}: ${currentStock} de ${barBase}`}
            >
              <div
                className="h-full"
                style={{
                  width: `${percent}%`,
                  backgroundColor: "var(--lp-primary)",
                  borderRadius: 999,
                }}
              />
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

function QuantityBlock({ block }: { block: LandingBlock }) {
  const { quantity, setQuantity, variant, currentStock } = useRuntime();
  const min = Math.max(1, propNumber(block.props, "min", 1));
  const configuredMax = Math.max(min, propNumber(block.props, "max", 10));

  // Teto real: o menor entre o do bloco, o limite por pedido da variação e o
  // estoque disponível. Pedir 5 de uma cor com 2 unidades seria recusado no
  // servidor de qualquer forma — melhor nem deixar escolher.
  const limits = [configuredMax];
  if (variant?.purchaseLimit) limits.push(variant.purchaseLimit);
  if (
    variant &&
    variant.trackInventory &&
    !variant.allowBackorder &&
    currentStock !== null
  ) {
    limits.push(Math.max(min, currentStock));
  }
  const max = Math.max(min, Math.min(...limits));
  // Quantidade efetiva é derivada: trocar para uma cor com menos estoque
  // reduz o número na hora, sem efeito de sincronização.
  const effective = Math.min(Math.max(quantity, min), max);

  return (
    <Section block={block}>
      <p className="text-sm font-semibold">
        {propText(block.props, "label", "Quantidade")}
      </p>
      <div
        className="mt-2 inline-flex items-center"
        style={{
          borderRadius: "calc(var(--lp-radius) * .7)",
          border: "1px solid var(--lp-border)",
        }}
      >
        <button
          type="button"
          aria-label="Diminuir quantidade"
          onClick={() => setQuantity(Math.max(min, effective - 1))}
          className="flex size-12 items-center justify-center"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-10 text-center font-semibold" aria-live="polite">
          {effective}
        </span>
        <button
          type="button"
          aria-label="Aumentar quantidade"
          onClick={() => setQuantity(Math.min(max, effective + 1))}
          className="flex size-12 items-center justify-center"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </Section>
  );
}

function BuyButtonBlock({ block }: { block: LandingBlock }) {
  const runtime = useRuntime();
  const { product, checkoutHref, track, mode, currentPriceCents, quantity } =
    runtime;
  const action = propText(block.props, "action", "checkout");
  const label = propText(block.props, "label", "Comprar agora");
  const fullWidth = propBool(block.props, "fullWidth", true);
  const sticky = propBool(block.props, "sticky");
  const helperText = propText(block.props, "helperText");
  const [warning, setWarning] = React.useState("");

  const needsVariant =
    (product?.variants.length ?? 0) > 0 && runtime.variantId === null;
  // Opção esgotada ou fora de venda: o botão fica desativado, com o motivo
  // no lugar do rótulo. Nada de deixar clicar e falhar no checkout.
  const blocked = !runtime.canBuy;
  const blockedLabel = propText(
    block.props,
    "soldOutLabel",
    "Opção indisponível",
  );

  const href = React.useMemo(() => {
    if (action === "external") return propText(block.props, "externalUrl");
    if (action === "whatsapp") return "";
    return checkoutHref();
  }, [action, block.props, checkoutHref]);

  function handleClick(event: React.MouseEvent) {
    if (mode === "editor") {
      event.preventDefault();
      return;
    }
    if (needsVariant) {
      event.preventDefault();
      setWarning("Escolha uma variação antes de continuar.");
      return;
    }
    if (blocked) {
      event.preventDefault();
      setWarning("Esta opção está indisponível. Escolha outra para continuar.");
      return;
    }
    setWarning("");

    const chosenVariant = runtime.variant
      ? {
          id: runtime.variant.publicId,
          name: runtime.variant.name,
          sku: runtime.variant.sku ?? undefined,
        }
      : undefined;

    track("cta_click", { blockId: block.id, variant: chosenVariant });
    if (action === "add_to_cart") {
      track("add_to_cart", {
        valueCents: currentPriceCents * quantity,
        variant: chosenVariant,
      });
    }
    if (action !== "external" && action !== "whatsapp") {
      track("initiate_checkout", {
        valueCents: currentPriceCents * quantity,
        variant: chosenVariant,
      });
    }
  }

  const button = (
    <>
      <a
        href={blocked ? "#" : href || "#"}
        onClick={handleClick}
        aria-disabled={blocked}
        className={cn(
          "inline-flex min-h-13 items-center justify-center px-8 py-3.5 text-base",
          fullWidth ? "w-full" : "w-auto",
          blocked
            ? "cursor-not-allowed opacity-50"
            : "hover:brightness-95 active:brightness-90",
        )}
        style={buttonStyle(runtime.snapshot.theme)}
      >
        {blocked ? blockedLabel : label}
      </a>
      {warning ? (
        <p
          className="mt-2 text-sm font-medium"
          role="alert"
          style={{ color: "#DC2626" }}
        >
          {warning}
        </p>
      ) : null}
      {helperText ? (
        <p
          className="mt-2 text-center text-xs"
          style={{ color: "var(--lp-muted)" }}
        >
          {helperText}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      <Section block={block}>
        <div id={block.anchorId || "comprar"}>{button}</div>
      </Section>
      {sticky && mode === "public" ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t p-3 md:hidden"
          style={{
            backgroundColor: "var(--lp-bg)",
            borderColor: "var(--lp-border)",
          }}
        >
          <a
            href={blocked ? "#" : href || "#"}
            onClick={handleClick}
            aria-disabled={blocked}
            className={cn(
              "flex min-h-12 w-full items-center justify-center px-6 text-base",
              blocked && "cursor-not-allowed opacity-50",
            )}
            style={buttonStyle(runtime.snapshot.theme)}
          >
            {blocked ? blockedLabel : label}
          </a>
        </div>
      ) : null}
    </>
  );
}

function WhatsappBlock({ block }: { block: LandingBlock }) {
  const { track, mode } = useRuntime();
  const phone = propText(block.props, "phone").replace(/\D/g, "");
  const message = propText(block.props, "message");
  const label = propText(block.props, "label", "Falar no WhatsApp");
  const floating = propBool(block.props, "floating");

  if (!phone) return null;

  const href = `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;

  const onClick = (event: React.MouseEvent) => {
    if (mode === "editor") {
      event.preventDefault();
      return;
    }
    track("cta_click", { blockId: block.id });
  };

  if (floating && mode === "public") {
    return (
      <a
        href={href}
        onClick={onClick}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="fixed right-4 bottom-20 z-40 flex size-14 items-center justify-center rounded-full text-white shadow-lg md:bottom-6"
        style={{ backgroundColor: "#25D366" }}
      >
        <MessageCircle className="size-7" />
      </a>
    );
  }

  return (
    <Section block={block}>
      <a
        href={href}
        onClick={onClick}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 items-center gap-2 px-6 text-base font-bold text-white"
        style={{ backgroundColor: "#25D366", borderRadius: "var(--lp-radius)" }}
      >
        <MessageCircle className="size-5" /> {label}
      </a>
    </Section>
  );
}

function BenefitsBlock({ block }: { block: LandingBlock }) {
  const items = propPairs(block.props, "items");
  const columns = Math.min(
    4,
    Math.max(1, propNumber(block.props, "columns", 3)),
  );
  const title = propText(block.props, "title");
  if (items.length === 0) return null;

  const gridClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : columns === 3
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
          : "grid-cols-2 md:grid-cols-4";

  return (
    <Section block={block}>
      {title ? <Heading className="mb-6">{title}</Heading> : null}
      <div className={cn("grid gap-4", gridClass)}>
        {items.map(([label, description], index) => (
          <div
            key={`${label}-${index}`}
            className="p-5"
            style={{
              borderRadius: "var(--lp-radius)",
              border: "1px solid var(--lp-border)",
              backgroundColor: "var(--lp-surface)",
            }}
          >
            <Check className="size-5" style={{ color: "var(--lp-primary)" }} />
            <p className="mt-3 font-bold">{label}</p>
            {description ? (
              <p className="mt-1 text-sm" style={{ color: "var(--lp-muted)" }}>
                {description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function TrustBadgesBlock({ block }: { block: LandingBlock }) {
  const items = propList(block.props, "items");
  const showPayment = propBool(block.props, "showPaymentIcons", true);

  return (
    <Section block={block}>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-medium">
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="flex items-center gap-2">
            <ShieldCheck
              className="size-4"
              style={{ color: "var(--lp-primary)" }}
            />
            {item}
          </span>
        ))}
      </div>
      {showPayment ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Img
            src="/landing/mbway.svg"
            alt="MB WAY"
            className="h-9 rounded border bg-white px-2 py-1"
          />
          <Img
            src="/landing/multibanco.svg"
            alt="Multibanco"
            className="h-9 rounded border bg-white px-2 py-1"
          />
        </div>
      ) : null}
    </Section>
  );
}

function DescriptionBlock({ block }: { block: LandingBlock }) {
  const { product } = useRuntime();
  const useProduct = propBool(block.props, "useProductDescription", true);
  const body = useProduct
    ? product?.description || propText(block.props, "body")
    : propText(block.props, "body");

  if (!body?.trim()) return null;

  return (
    <Section block={block}>
      <Heading className="mb-4">
        {propText(block.props, "title", "Descrição")}
      </Heading>
      <div className="space-y-4 text-base leading-relaxed">
        {body
          .split(/\n{2,}|\n/)
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
      </div>
    </Section>
  );
}

function SpecsBlock({ block }: { block: LandingBlock }) {
  const items = propPairs(block.props, "items");
  if (items.length === 0) return null;

  return (
    <Section block={block}>
      <Heading className="mb-4">
        {propText(block.props, "title", "Especificações")}
      </Heading>
      <dl
        className="overflow-hidden"
        style={{
          borderRadius: "var(--lp-radius)",
          border: "1px solid var(--lp-border)",
        }}
      >
        {items.map(([label, value], index) => (
          <div
            key={`${label}-${index}`}
            className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"
            style={{
              borderTop: index === 0 ? "none" : "1px solid var(--lp-border)",
              backgroundColor:
                index % 2 === 0 ? "var(--lp-surface)" : undefined,
            }}
          >
            <dt className="font-semibold">{label}</dt>
            <dd style={{ color: "var(--lp-muted)" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function ImageTextBlock({ block }: { block: LandingBlock }) {
  const image = propText(block.props, "imageUrl");
  const title = propText(block.props, "title");
  const body = propText(block.props, "body");
  const position = propText(block.props, "imagePosition", "left");
  if (!image && !title && !body) return null;

  const picture = image ? (
    <Img
      src={image}
      alt={title}
      className="w-full object-cover"
      style={{ borderRadius: "var(--lp-radius)" }}
    />
  ) : null;

  const text = (
    <div>
      {title ? <Heading className="mb-3">{title}</Heading> : null}
      {body ? (
        <div className="space-y-3 text-base leading-relaxed">
          {body.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <Section block={block}>
      <div className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
        {position === "right" ? (
          <>
            {text}
            <div>{picture}</div>
          </>
        ) : (
          <>
            <div>{picture}</div>
            {text}
          </>
        )}
      </div>
    </Section>
  );
}

function FeaturesBlock({ block }: { block: LandingBlock }) {
  const items = propList(block.props, "items");
  if (items.length === 0) return null;

  return (
    <Section block={block}>
      {propText(block.props, "title") ? (
        <Heading className="mb-4">{propText(block.props, "title")}</Heading>
      ) : null}
      <ul className="space-y-2.5">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex items-start gap-2.5 text-base"
          >
            <Check
              className="mt-0.5 size-5 shrink-0"
              style={{ color: "var(--lp-primary)" }}
            />
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ComparisonBlock({ block }: { block: LandingBlock }) {
  const rows = propList(block.props, "rows").map((line) =>
    line.split("|").map((part) => part.trim()),
  );
  if (rows.length === 0) return null;

  return (
    <Section block={block}>
      <Heading className="mb-4">
        {propText(block.props, "title", "Comparação")}
      </Heading>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--lp-surface)" }}>
              <th className="px-4 py-3 text-left font-semibold">Critério</th>
              <th className="px-4 py-3 text-left font-semibold">
                {propText(block.props, "columnA", "Coluna 1")}
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                {propText(block.props, "columnB", "Coluna 2")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, index) => (
              <tr
                key={index}
                style={{ borderTop: "1px solid var(--lp-border)" }}
              >
                <td className="px-4 py-3 font-medium">{cells[0] ?? ""}</td>
                <td className="px-4 py-3">{cells[1] ?? ""}</td>
                <td className="px-4 py-3" style={{ color: "var(--lp-muted)" }}>
                  {cells[2] ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function StarRow({ value }: { value: number }) {
  return (
    <span className="flex text-amber-500" aria-label={`${value} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "size-4",
            index < Math.round(value) ? "fill-current" : "opacity-25",
          )}
        />
      ))}
    </span>
  );
}

function ReviewsBlock({ block }: { block: LandingBlock }) {
  const { reviews, locale } = useRuntime();
  const limit = propNumber(block.props, "limit", 10);
  const list = reviews.slice(0, Math.max(1, limit));
  const title = propText(block.props, "title", "Avaliações dos clientes");

  if (list.length === 0) {
    const message = propText(block.props, "emptyMessage");
    if (!message) return null;
    return (
      <Section block={block}>
        <Heading className="mb-4">{title}</Heading>
        <p
          className="p-8 text-center text-sm"
          style={{
            borderRadius: "var(--lp-radius)",
            border: "1px dashed var(--lp-border)",
            color: "var(--lp-muted)",
          }}
        >
          {message}
        </p>
      </Section>
    );
  }

  const average = list.reduce((sum, r) => sum + r.stars, 0) / list.length;

  return (
    <Section block={block}>
      <Heading className="mb-4">{title}</Heading>
      <div
        className="flex flex-wrap items-center gap-3 p-4"
        style={{
          borderRadius: "var(--lp-radius)",
          backgroundColor: "var(--lp-surface)",
        }}
      >
        <span className="text-3xl font-black">
          {average.toLocaleString(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
        </span>
        <StarRow value={average} />
        <span className="text-sm" style={{ color: "var(--lp-muted)" }}>
          {list.length} {list.length === 1 ? "avaliação" : "avaliações"}
        </span>
      </div>
      <div className="mt-4 space-y-4">
        {list.map((review, index) => (
          <article
            key={`${review.name}-${index}`}
            className="p-4"
            style={{
              borderRadius: "var(--lp-radius)",
              border: "1px solid var(--lp-border)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">{review.name}</strong>
              {review.verifiedPurchase ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <BadgeCheck className="size-3.5" /> Compra verificada
                </span>
              ) : null}
              <span className="text-xs" style={{ color: "var(--lp-muted)" }}>
                {review.location}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <StarRow value={review.stars} />
              {review.title ? (
                <span className="text-sm font-bold">{review.title}</span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed">{review.text}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function TestimonialsBlock({ block }: { block: LandingBlock }) {
  const items = propPairs(block.props, "items");
  if (items.length === 0) return null;

  return (
    <Section block={block}>
      <Heading className="mb-4">{propText(block.props, "title")}</Heading>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([name, quote], index) => (
          <blockquote
            key={`${name}-${index}`}
            className="p-5"
            style={{
              borderRadius: "var(--lp-radius)",
              border: "1px solid var(--lp-border)",
              backgroundColor: "var(--lp-surface)",
            }}
          >
            <p className="text-base leading-relaxed">“{quote}”</p>
            <footer className="mt-3 text-sm font-semibold">{name}</footer>
          </blockquote>
        ))}
      </div>
    </Section>
  );
}

function FaqBlock({ block }: { block: LandingBlock }) {
  const items = propPairs(block.props, "items");
  if (items.length === 0) return null;

  return (
    <Section block={block}>
      <Heading className="mb-4">
        {propText(block.props, "title", "Perguntas frequentes")}
      </Heading>
      <div className="space-y-2">
        {items.map(([question, answer], index) => (
          <details
            key={`${question}-${index}`}
            className="group px-4 py-3"
            style={{
              borderRadius: "var(--lp-radius)",
              border: "1px solid var(--lp-border)",
            }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              {question}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: "var(--lp-muted)" }}
            >
              {answer}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function ShippingBlock({ block }: { block: LandingBlock }) {
  const items = propList(block.props, "items");
  const estimate = propText(block.props, "estimate");

  return (
    <Section block={block}>
      <Heading className="mb-4">
        {propText(block.props, "title", "Entrega e devoluções")}
      </Heading>
      {estimate ? (
        <p className="flex items-center gap-2 text-base font-semibold">
          <Truck className="size-5" style={{ color: "var(--lp-primary)" }} />
          Prazo estimado: {estimate}
        </p>
      ) : null}
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-2">
            <Check
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--lp-primary)" }}
            />
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function GuaranteeBlock({ block }: { block: LandingBlock }) {
  const days = propNumber(block.props, "days", 0);

  return (
    <Section block={block}>
      <div
        className="flex flex-wrap items-center gap-4 p-6"
        style={{
          borderRadius: "var(--lp-radius)",
          border: "1px solid var(--lp-border)",
          backgroundColor: "var(--lp-surface)",
        }}
      >
        <ShieldCheck
          className="size-10 shrink-0"
          style={{ color: "var(--lp-primary)" }}
        />
        <div>
          <p className="text-lg font-bold">
            {propText(block.props, "title", "Garantia")}
            {days > 0 ? ` · ${days} dias` : ""}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--lp-muted)" }}>
            {propText(block.props, "body")}
          </p>
        </div>
      </div>
    </Section>
  );
}

function CountdownBlock({ block }: { block: LandingBlock }) {
  const endsAt = propText(block.props, "endsAt");
  const target = React.useMemo(() => {
    if (!endsAt) return null;
    const parsed = new Date(endsAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [endsAt]);

  const [remaining, setRemaining] = React.useState(() =>
    target ? target.getTime() - Date.now() : 0,
  );

  React.useEffect(() => {
    if (!target) return;
    const timer = setInterval(
      () => setRemaining(target.getTime() - Date.now()),
      1000,
    );
    return () => clearInterval(timer);
  }, [target]);

  // Sem data configurada o bloco não aparece: uma contagem que reinicia
  // sozinha a cada visita é publicidade enganosa.
  if (!target) return null;

  const finished = remaining <= 0;
  if (finished && propBool(block.props, "hideWhenFinished")) return null;

  const seconds = Math.max(0, Math.floor(remaining / 1000));
  const parts = [
    { value: Math.floor(seconds / 86400), label: "dias" },
    { value: Math.floor((seconds % 86400) / 3600), label: "horas" },
    { value: Math.floor((seconds % 3600) / 60), label: "min" },
    { value: seconds % 60, label: "seg" },
  ];

  return (
    <Section block={block}>
      <div className="text-center">
        <p className="text-base font-semibold">
          {finished
            ? propText(block.props, "finishedText", "Campanha encerrada")
            : propText(block.props, "title")}
        </p>
        {!finished ? (
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {parts.map((part) => (
              <div
                key={part.label}
                className="min-w-18 px-4 py-3"
                style={{
                  borderRadius: "var(--lp-radius)",
                  backgroundColor: "var(--lp-surface)",
                  border: "1px solid var(--lp-border)",
                }}
              >
                <span className="block text-2xl font-black tabular-nums">
                  {String(part.value).padStart(2, "0")}
                </span>
                <span className="text-xs" style={{ color: "var(--lp-muted)" }}>
                  {part.label}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function FormBlock({ block }: { block: LandingBlock }) {
  const runtime = useRuntime();
  const { pageId, mode, track } = runtime;
  const [status, setStatus] = React.useState<
    "idle" | "sending" | "done" | "error"
  >("idle");
  const [error, setError] = React.useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "editor") return;

    const formData = new FormData(event.currentTarget);
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/public/lp-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          email: String(formData.get("email") ?? ""),
          name: String(formData.get("name") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          consent: formData.get("consent") === "on",
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setStatus("error");
        setError(payload?.error ?? "Não foi possível enviar. Tente novamente.");
        return;
      }

      setStatus("done");
      track("lead", { blockId: block.id });
    } catch {
      setStatus("error");
      setError("Não foi possível enviar. Verifique a ligação à internet.");
    }
  }

  const inputStyle: React.CSSProperties = {
    borderRadius: "calc(var(--lp-radius) * .6)",
    border: "1px solid var(--lp-border)",
    backgroundColor: "var(--lp-bg)",
    color: "var(--lp-text)",
  };

  if (status === "done") {
    return (
      <Section block={block}>
        <p
          className="p-6 text-center text-base font-semibold"
          style={{
            borderRadius: "var(--lp-radius)",
            backgroundColor: "var(--lp-surface)",
          }}
        >
          {propText(
            block.props,
            "successMessage",
            "Recebemos os seus dados. Obrigado!",
          )}
        </p>
      </Section>
    );
  }

  return (
    <Section block={block}>
      <div
        className="mx-auto max-w-lg p-6"
        style={{
          borderRadius: "var(--lp-radius)",
          border: "1px solid var(--lp-border)",
          backgroundColor: "var(--lp-surface)",
        }}
      >
        <Heading level="h3">{propText(block.props, "title")}</Heading>
        {propText(block.props, "description") ? (
          <p className="mt-2 text-sm" style={{ color: "var(--lp-muted)" }}>
            {propText(block.props, "description")}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {propBool(block.props, "askName", true) ? (
            <div>
              <label
                htmlFor={`${block.id}-name`}
                className="text-sm font-medium"
              >
                Nome
              </label>
              <input
                id={`${block.id}-name`}
                name="name"
                autoComplete="name"
                className="mt-1 min-h-11 w-full px-3"
                style={inputStyle}
              />
            </div>
          ) : null}

          <div>
            <label
              htmlFor={`${block.id}-email`}
              className="text-sm font-medium"
            >
              E-mail
            </label>
            <input
              id={`${block.id}-email`}
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 min-h-11 w-full px-3"
              style={inputStyle}
            />
          </div>

          {propBool(block.props, "askPhone") ? (
            <div>
              <label
                htmlFor={`${block.id}-phone`}
                className="text-sm font-medium"
              >
                Telefone
              </label>
              <input
                id={`${block.id}-phone`}
                name="phone"
                type="tel"
                autoComplete="tel"
                className="mt-1 min-h-11 w-full px-3"
                style={inputStyle}
              />
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-1 size-4"
            />
            {propText(block.props, "consentText", "Autorizo o contacto.")}
          </label>

          {error ? (
            <p
              className="text-sm font-medium"
              role="alert"
              style={{ color: "#DC2626" }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status === "sending"}
            className="min-h-12 w-full px-6 text-base disabled:opacity-60"
            style={buttonStyle(runtime.snapshot.theme)}
          >
            {status === "sending"
              ? "A enviar…"
              : propText(block.props, "buttonLabel", "Enviar")}
          </button>
        </form>
      </div>
    </Section>
  );
}

function StandardLandingFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white px-4 py-5 text-center text-xs text-zinc-500">
      <div className="mx-auto w-full max-w-6xl">
        <p>
          © {new Date().getFullYear()} {STANDARD_STOREFRONT.name} · Pagamento
          seguro por MB WAY e Multibanco
        </p>
        <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <a href="/legal/termos" className="hover:text-zinc-800">
            Termos
          </a>
          <a href="/legal/privacidade" className="hover:text-zinc-800">
            Privacidade
          </a>
          <a href="/legal/devolucoes" className="hover:text-zinc-800">
            Devoluções
          </a>
        </nav>
      </div>
    </footer>
  );
}

function CustomHtmlBlock({ block }: { block: LandingBlock }) {
  const html = propText(block.props, "html");
  const safe = React.useMemo(() => sanitizeHtml(html), [html]);
  if (!safe.trim()) return null;

  return (
    <Section block={block}>
      <div dangerouslySetInnerHTML={{ __html: safe }} />
    </Section>
  );
}

const BLOCK_COMPONENTS: Record<
  string,
  React.ComponentType<{ block: LandingBlock }>
> = {
  announcement: AnnouncementBlock,
  logo: LogoBlock,
  menu: MenuBlock,
  hero: HeroBlock,
  gallery: GalleryBlock,
  video: VideoBlock,
  heading: HeadingBlock,
  text: TextBlock,
  price: PriceBlock,
  offer: OfferBlock,
  variants: VariantsBlock,
  stock: StockBlock,
  quantity: QuantityBlock,
  buy_button: BuyButtonBlock,
  whatsapp: WhatsappBlock,
  benefits: BenefitsBlock,
  trust_badges: TrustBadgesBlock,
  description: DescriptionBlock,
  specs: SpecsBlock,
  image_text: ImageTextBlock,
  features: FeaturesBlock,
  comparison: ComparisonBlock,
  reviews: ReviewsBlock,
  testimonials: TestimonialsBlock,
  faq: FaqBlock,
  shipping: ShippingBlock,
  guarantee: GuaranteeBlock,
  form: FormBlock,
  countdown: CountdownBlock,
  custom_html: CustomHtmlBlock,
};

/** Um bloco isolado — exportado para o canvas do editor envolver com seleção. */
export function RenderBlock({ block }: { block: LandingBlock }) {
  const Component = BLOCK_COMPONENTS[block.type];
  if (!Component) return null;
  return <Component block={block} />;
}

// ---------------------------------------------------------------------------
// Raiz
// ---------------------------------------------------------------------------

export interface LandingRendererProps {
  snapshot: LandingSnapshot;
  reviews: PublicReview[];
  pageId: string;
  mode?: RenderMode;
  /**
   * Variação pedida na URL (`?variant=`), já resolvida no servidor. Resolver
   * antes de renderizar evita a página abrir numa cor e saltar para outra
   * depois da hidratação.
   */
  initialVariantPublicId?: string;
  /** Envolve cada bloco (usado pelo canvas para seleção e arrasto) */
  wrapBlock?: (block: LandingBlock, node: React.ReactNode) => React.ReactNode;
  className?: string;
}

/**
 * Renderiza uma landing page a partir do snapshot.
 *
 * O mesmo componente serve a página pública e a pré-visualização do editor —
 * é por isso que o que se vê no editor é exatamente o que o cliente recebe.
 * A diferença entre os dois modos é apenas comportamental: no editor os
 * links não navegam e nenhum evento é enviado.
 */
export function LandingRenderer({
  snapshot,
  reviews,
  pageId,
  mode = "public",
  initialVariantPublicId,
  wrapBlock,
  className,
}: LandingRendererProps) {
  const product = snapshot.product;
  const [quantity, setQuantity] = React.useState(1);
  const [variantId, setVariantId] = React.useState<string | null>(
    () => pickInitialVariant(product, initialVariantPublicId)?.id ?? null,
  );

  const locale = snapshot.language || "pt-PT";
  const currency = product?.currency ?? snapshot.currency ?? "EUR";

  const money = React.useCallback(
    (cents: number) => formatMoney(cents, currency, locale),
    [currency, locale],
  );

  const variant = React.useMemo(
    () => product?.variants.find((item) => item.id === variantId) ?? null,
    [product, variantId],
  );

  const currentPriceCents = React.useMemo(() => {
    if (!product) return 0;
    return variant?.priceCents ?? product.priceCents;
  }, [product, variant]);

  const currentCompareAtCents =
    variant?.compareAtPriceCents ?? product?.comparePriceCents ?? null;

  const currentGallery = React.useMemo(() => {
    if (!product) return [];
    // Variação sem fotos próprias herda a galeria geral — a página nunca
    // fica sem imagem por falta de upload numa cor.
    return variant && variant.gallery.length > 0
      ? variant.gallery
      : product.gallery;
  }, [product, variant]);

  const currentStock = React.useMemo(() => {
    if (variant) return variant.trackInventory ? variant.stockQuantity : null;
    if (!product) return null;
    return product.trackInventory ? product.stockQuantity : null;
  }, [product, variant]);

  const canBuy = variant ? isPurchasable(variant) : true;

  // Primeira imagem da nova galeria carregada de imediato: sem isso o clique
  // na cor mostraria um quadro vazio até a rede responder.
  React.useEffect(() => {
    if (mode !== "public" || typeof window === "undefined") return;
    const first = currentGallery[0];
    if (!first) return;
    const image = new window.Image();
    image.src = first;
  }, [currentGallery, mode]);

  const track = React.useCallback(
    (event: TrackableEvent, extra: Record<string, unknown> = {}) => {
      if (mode !== "public") return;
      try {
        const params = collectForwardParams();
        void fetch("/api/public/lp-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            pageId,
            event,
            anonymousId: anonymousId(),
            currency,
            source: params.get("utm_source") ?? undefined,
            campaign: params.get("utm_campaign") ?? undefined,
            ...extra,
          }),
        }).catch(() => {});
      } catch {
        /* rastreamento nunca quebra a página */
      }
    },
    [mode, pageId, currency],
  );

  const checkoutHref = React.useCallback(() => {
    if (!product) return "#";
    const params = collectForwardParams();
    params.set("qty", String(quantity));
    params.set("lp", pageId);
    // Vai o identificador público, não o UUID: é o que o servidor revalida
    // contra o banco antes de calcular qualquer preço.
    if (variant) params.set("variant", variant.publicId);

    // Parâmetros padrão da página entram só onde ainda não há valor vindo
    // do anúncio — o que o anunciante mandou tem prioridade.
    for (const [key, value] of new URLSearchParams(
      snapshot.tracking.defaultUtm,
    )) {
      if (!params.has(key)) params.set(key, value);
    }

    return `/checkout/${product.checkoutSlug}?${params.toString()}`;
  }, [product, quantity, pageId, variant, snapshot.tracking.defaultUtm]);

  const runtime: RuntimeValue = {
    mode,
    pageId,
    snapshot,
    product,
    reviews,
    locale,
    quantity,
    setQuantity,
    variantId,
    setVariantId: (value) => {
      setVariantId(value);

      const chosen = product?.variants.find((item) => item.id === value);
      if (!chosen) return;

      // Um evento por troca, com o que o anúncio precisa saber. O envio ao
      // Meta/TikTok continua a cargo do bloco de pixels — aqui nada é
      // disparado duas vezes.
      track("select_variant", {
        valueCents: chosen.priceCents ?? product?.priceCents,
        variant: {
          id: chosen.publicId,
          name: chosen.name,
          sku: chosen.sku ?? undefined,
          options: chosen.attributes,
        },
      });

      // Endereço partilhável da cor escolhida, sem recarregar a página.
      if (mode === "public" && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("variant", chosen.publicId);
        window.history.replaceState(null, "", url.toString());
      }
    },
    variant,
    track,
    money,
    checkoutHref,
    currentPriceCents,
    currentCompareAtCents,
    currentGallery,
    currentStock,
    canBuy,
  };

  React.useEffect(() => {
    if (mode !== "public") return;
    track("page_view");
    track("view_content", { valueCents: currentPriceCents });
    // Só na montagem: recontar a cada mudança de preço inflaria as visitas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const visibleBlocks = snapshot.content.blocks.filter(
    (block) =>
      !block.hidden && block.type !== "header" && block.type !== "footer",
  );

  return (
    <RuntimeContext.Provider value={runtime}>
      <style dangerouslySetInnerHTML={{ __html: LANDING_BASE_CSS }} />
      {snapshot.customCode.css ? (
        <style dangerouslySetInnerHTML={{ __html: snapshot.customCode.css }} />
      ) : null}
      <div
        className={cn("lp-root flex min-h-svh flex-col", className)}
        style={themeToCssVars(snapshot.theme)}
      >
        <StandardLandingHeader />
        <div className="flex-1">
          {visibleBlocks.map((block) => {
            const node = <RenderBlock key={block.id} block={block} />;
            return wrapBlock ? (
              <React.Fragment key={block.id}>
                {wrapBlock(block, node)}
              </React.Fragment>
            ) : (
              node
            );
          })}
        </div>
        <StandardLandingFooter />
      </div>
    </RuntimeContext.Provider>
  );
}
