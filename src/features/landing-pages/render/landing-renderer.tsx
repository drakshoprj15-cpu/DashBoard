"use client";

import * as React from "react";
import {
  BadgeCheck,
  Check,
  ChevronDown,
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

import {
  propBool,
  propList,
  propNumber,
  propPairs,
  propText,
  type LandingBlock,
  type LandingProductData,
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
  track: (event: TrackableEvent, extra?: Record<string, unknown>) => void;
  money: (cents: number) => string;
  checkoutHref: () => string;
  /** Preço atual considerando a variação escolhida */
  currentPriceCents: number;
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
function toEmbedUrl(url: string): { kind: "iframe" | "video"; src: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const youtube = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/,
  );
  if (youtube) {
    return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${youtube[1]}` };
  }

  const vimeo = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  }

  if (/^https?:\/\//i.test(trimmed) && /\.(mp4|webm|ogg)(\?|$)/i.test(trimmed)) {
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
      style={{ paddingTop: 32, paddingBottom: 32, ...blockStyleToCss(block.style) }}
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
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
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

function HeaderBlock({ block }: { block: LandingBlock }) {
  const { snapshot } = useRuntime();
  const showLogo = propBool(block.props, "showLogo", true);
  const items = propPairs(block.props, "menuItems");
  const sticky = propBool(block.props, "sticky");
  const showCta = propBool(block.props, "showCta");
  const logoUrl = snapshot.logoUrl;

  return (
    <header
      className={cn(
        "z-30 px-4 py-4",
        sticky && "sticky top-0",
        visibilityClass(block.style),
      )}
      style={{
        backgroundColor: "var(--lp-header-bg)",
        color: "var(--lp-header-text)",
        ...blockStyleToCss(block.style),
      }}
    >
      <div
        className="mx-auto flex w-full flex-wrap items-center justify-between gap-3"
        style={{ maxWidth: "var(--lp-max-width)" }}
      >
        {showLogo ? (
          logoUrl ? (
            <Img
              src={logoUrl}
              alt={snapshot.publicName}
              priority
              className="h-9 max-w-[200px] object-contain md:h-10"
            />
          ) : (
            <span className="text-lg font-black tracking-tight">
              {snapshot.publicName}
            </span>
          )
        ) : (
          <span />
        )}

        <nav className="flex flex-wrap items-center gap-4 text-sm">
          {items.map(([label, href], index) => (
            <a key={`${label}-${index}`} href={href || "#"} className="hover:opacity-80">
              {label}
            </a>
          ))}
          {showCta && (
            <a
              href={propText(block.props, "ctaTarget", "#comprar") || "#comprar"}
              className="inline-flex min-h-10 items-center px-4 text-sm font-bold"
              style={buttonStyle(snapshot.theme)}
            >
              {propText(block.props, "ctaLabel", "Comprar")}
            </a>
          )}
        </nav>
      </div>
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
          <a key={`${label}-${index}`} href={href || "#"} className="hover:opacity-70">
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
  const image = propText(block.props, "imageUrl") || product?.mainImageUrl || "";
  const eyebrow = propText(block.props, "eyebrow");
  const ctaLabel = propText(block.props, "ctaLabel");
  const ctaTarget = propText(block.props, "ctaTarget", "#comprar");

  const text = (
    <div className={layout === "centered" ? "text-center" : undefined}>
      {eyebrow ? (
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-bold"
          style={{
            backgroundColor: "color-mix(in srgb, var(--lp-primary) 14%, transparent)",
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
        <p className="mt-4 text-base md:text-lg" style={{ color: "var(--lp-muted)" }}>
          {subtitle}
        </p>
      ) : null}
      {ctaLabel ? (
        <div className={cn("mt-6", layout === "centered" && "flex justify-center")}>
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
      style={{ borderRadius: "var(--lp-radius)", boxShadow: "var(--lp-shadow)" }}
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
  const { product } = useRuntime();
  const custom = propList(block.props, "images");
  const images = custom.length > 0 ? custom : (product?.gallery ?? []);
  const layout = propText(block.props, "layout", "thumbs");
  const [active, setActive] = React.useState(0);

  if (images.length === 0) return null;

  if (layout === "grid") {
    return (
      <Section block={block}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((src, index) => (
            <Img
              key={`${src}-${index}`}
              src={src}
              alt={product?.name ?? "Imagem do produto"}
              priority={index === 0}
              className="aspect-square w-full bg-white object-contain"
              style={{ borderRadius: "var(--lp-radius)", border: "1px solid var(--lp-border)" }}
            />
          ))}
        </div>
      </Section>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <Section block={block}>
      <div
        className="overflow-hidden bg-white"
        style={{ borderRadius: "var(--lp-radius)", border: "1px solid var(--lp-border)" }}
      >
        <Img
          src={current}
          alt={product?.name ?? "Imagem do produto"}
          priority
          className="aspect-square w-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((src, index) => (
            <button
              key={`${src}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Ver imagem ${index + 1}`}
              aria-current={index === active}
              className="overflow-hidden bg-white p-0"
              style={{
                borderRadius: "calc(var(--lp-radius) * .6)",
                border:
                  index === active
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
        style={{ borderRadius: "var(--lp-radius)", boxShadow: "var(--lp-shadow)" }}
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
      <Heading level={propText(block.props, "level", "h2") === "h3" ? "h3" : "h2"}>
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

function PriceBlock({ block }: { block: LandingBlock }) {
  const { product, money, currentPriceCents } = useRuntime();
  if (!product) return null;

  const compare = product.comparePriceCents;
  const showCompare = propBool(block.props, "showCompare", true) && compare;
  const discount =
    compare && compare > currentPriceCents
      ? Math.round((1 - currentPriceCents / compare) * 100)
      : null;
  const savings = compare ? compare - currentPriceCents : 0;

  return (
    <Section block={block}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-black tracking-tight">
          {money(currentPriceCents)}
        </span>
        {showCompare ? (
          <span className="text-lg line-through" style={{ color: "var(--lp-muted)" }}>
            {money(compare!)}
          </span>
        ) : null}
        {propBool(block.props, "showDiscount", true) && discount && discount > 0 ? (
          <span
            className="px-2 py-0.5 text-sm font-bold"
            style={{
              borderRadius: "calc(var(--lp-radius) * .5)",
              backgroundColor: "color-mix(in srgb, var(--lp-primary) 14%, transparent)",
              color: "var(--lp-primary)",
            }}
          >
            -{discount}%
          </span>
        ) : null}
      </div>
      {propBool(block.props, "showSavings", true) && savings > 0 ? (
        <p className="mt-1 font-semibold" style={{ color: "var(--lp-primary)" }}>
          Está a poupar {money(savings)}
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
          backgroundColor: "color-mix(in srgb, var(--lp-primary) 6%, transparent)",
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

function VariantsBlock({ block }: { block: LandingBlock }) {
  const { product, variantId, setVariantId, money } = useRuntime();
  const variants = product?.variants ?? [];
  if (variants.length === 0) return null;

  const style = propText(block.props, "style", "buttons");

  return (
    <Section block={block}>
      <p className="text-sm font-semibold">{propText(block.props, "label", "Escolha a variação")}</p>
      <div className={cn("mt-3 flex flex-wrap gap-2", style === "list" && "flex-col")}>
        {variants.map((variant) => {
          const selected = variant.id === variantId;
          const soldOut = product?.trackInventory && variant.stockQuantity <= 0;
          return (
            <button
              key={variant.id}
              type="button"
              disabled={soldOut}
              onClick={() => setVariantId(variant.id)}
              aria-pressed={selected}
              className={cn(
                "min-h-11 px-4 py-2 text-sm font-medium transition-colors",
                soldOut && "cursor-not-allowed opacity-40 line-through",
                style === "list" && "w-full text-left",
              )}
              style={{
                borderRadius: "calc(var(--lp-radius) * .7)",
                border: selected
                  ? "2px solid var(--lp-variant-selected)"
                  : "1px solid var(--lp-border)",
                color: selected ? "var(--lp-variant-selected)" : undefined,
              }}
            >
              {variant.name}
              {variant.priceCents ? (
                <span className="ml-2 opacity-70">{money(variant.priceCents)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function QuantityBlock({ block }: { block: LandingBlock }) {
  const { quantity, setQuantity } = useRuntime();
  const min = Math.max(1, propNumber(block.props, "min", 1));
  const max = Math.max(min, propNumber(block.props, "max", 10));

  return (
    <Section block={block}>
      <p className="text-sm font-semibold">{propText(block.props, "label", "Quantidade")}</p>
      <div
        className="mt-2 inline-flex items-center"
        style={{ borderRadius: "calc(var(--lp-radius) * .7)", border: "1px solid var(--lp-border)" }}
      >
        <button
          type="button"
          aria-label="Diminuir quantidade"
          onClick={() => setQuantity(Math.max(min, quantity - 1))}
          className="flex size-12 items-center justify-center"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-10 text-center font-semibold" aria-live="polite">
          {quantity}
        </span>
        <button
          type="button"
          aria-label="Aumentar quantidade"
          onClick={() => setQuantity(Math.min(max, quantity + 1))}
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
  const { product, checkoutHref, track, mode, currentPriceCents, quantity } = runtime;
  const action = propText(block.props, "action", "checkout");
  const label = propText(block.props, "label", "Comprar agora");
  const fullWidth = propBool(block.props, "fullWidth", true);
  const sticky = propBool(block.props, "sticky");
  const helperText = propText(block.props, "helperText");
  const [warning, setWarning] = React.useState("");

  const needsVariant =
    (product?.variants.length ?? 0) > 0 && runtime.variantId === null;

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
    setWarning("");
    track("cta_click", { blockId: block.id });
    if (action === "add_to_cart") track("add_to_cart");
    if (action !== "external" && action !== "whatsapp") {
      track("initiate_checkout", {
        valueCents: currentPriceCents * quantity,
      });
    }
  }

  const button = (
    <>
      <a
        href={href || "#"}
        onClick={handleClick}
        className={cn(
          "inline-flex min-h-13 items-center justify-center px-8 py-3.5 text-base",
          fullWidth ? "w-full" : "w-auto",
          "hover:brightness-95 active:brightness-90",
        )}
        style={buttonStyle(runtime.snapshot.theme)}
      >
        {label}
      </a>
      {warning ? (
        <p className="mt-2 text-sm font-medium" role="alert" style={{ color: "#DC2626" }}>
          {warning}
        </p>
      ) : null}
      {helperText ? (
        <p className="mt-2 text-center text-xs" style={{ color: "var(--lp-muted)" }}>
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
          style={{ backgroundColor: "var(--lp-bg)", borderColor: "var(--lp-border)" }}
        >
          <a
            href={href || "#"}
            onClick={handleClick}
            className="flex min-h-12 w-full items-center justify-center px-6 text-base"
            style={buttonStyle(runtime.snapshot.theme)}
          >
            {label}
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
  const columns = Math.min(4, Math.max(1, propNumber(block.props, "columns", 3)));
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
            <ShieldCheck className="size-4" style={{ color: "var(--lp-primary)" }} />
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
      <Heading className="mb-4">{propText(block.props, "title", "Descrição")}</Heading>
      <div className="space-y-4 text-base leading-relaxed">
        {body.split(/\n{2,}|\n/).filter(Boolean).map((paragraph, index) => (
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
      <Heading className="mb-4">{propText(block.props, "title", "Especificações")}</Heading>
      <dl
        className="overflow-hidden"
        style={{ borderRadius: "var(--lp-radius)", border: "1px solid var(--lp-border)" }}
      >
        {items.map(([label, value], index) => (
          <div
            key={`${label}-${index}`}
            className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"
            style={{
              borderTop: index === 0 ? "none" : "1px solid var(--lp-border)",
              backgroundColor: index % 2 === 0 ? "var(--lp-surface)" : undefined,
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
          <li key={`${item}-${index}`} className="flex items-start gap-2.5 text-base">
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
      <Heading className="mb-4">{propText(block.props, "title", "Comparação")}</Heading>
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
              <tr key={index} style={{ borderTop: "1px solid var(--lp-border)" }}>
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
          className={cn("size-4", index < Math.round(value) ? "fill-current" : "opacity-25")}
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
          {average.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
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
            style={{ borderRadius: "var(--lp-radius)", border: "1px solid var(--lp-border)" }}
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
              {review.title ? <span className="text-sm font-bold">{review.title}</span> : null}
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
            style={{ borderRadius: "var(--lp-radius)", border: "1px solid var(--lp-border)" }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              {question}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
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
            <Check className="mt-0.5 size-4 shrink-0" style={{ color: "var(--lp-primary)" }} />
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
        <ShieldCheck className="size-10 shrink-0" style={{ color: "var(--lp-primary)" }} />
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
  const [status, setStatus] = React.useState<"idle" | "sending" | "done" | "error">("idle");
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

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

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
          {propText(block.props, "successMessage", "Recebemos os seus dados. Obrigado!")}
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
              <label htmlFor={`${block.id}-name`} className="text-sm font-medium">
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
            <label htmlFor={`${block.id}-email`} className="text-sm font-medium">
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
              <label htmlFor={`${block.id}-phone`} className="text-sm font-medium">
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
            <input type="checkbox" name="consent" required className="mt-1 size-4" />
            {propText(block.props, "consentText", "Autorizo o contacto.")}
          </label>

          {error ? (
            <p className="text-sm font-medium" role="alert" style={{ color: "#DC2626" }}>
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

function FooterBlock({ block }: { block: LandingBlock }) {
  const { snapshot } = useRuntime();
  const links = propPairs(block.props, "links");
  const showLegal = propBool(block.props, "showLegalLinks", true);
  const text =
    propText(block.props, "text") ||
    `© ${new Date().getFullYear()} ${snapshot.publicName}`;

  return (
    <footer
      className={cn("px-4 py-8 text-center text-sm", visibilityClass(block.style))}
      style={{
        backgroundColor: "var(--lp-footer-bg)",
        color: "var(--lp-footer-text)",
        ...blockStyleToCss(block.style),
      }}
    >
      <div className="mx-auto w-full" style={{ maxWidth: "var(--lp-max-width)" }}>
        <p>{text}</p>
        <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {links.map(([label, href], index) => (
            <a key={`${label}-${index}`} href={href || "#"} className="hover:opacity-80">
              {label}
            </a>
          ))}
          {showLegal ? (
            <>
              <a href="/legal/termos" className="hover:opacity-80">
                Termos
              </a>
              <a href="/legal/privacidade" className="hover:opacity-80">
                Privacidade
              </a>
              <a href="/legal/devolucoes" className="hover:opacity-80">
                Devoluções
              </a>
            </>
          ) : null}
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
  header: HeaderBlock,
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
  footer: FooterBlock,
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
  wrapBlock,
  className,
}: LandingRendererProps) {
  const product = snapshot.product;
  const [quantity, setQuantity] = React.useState(1);
  const [variantId, setVariantId] = React.useState<string | null>(
    product?.variants[0]?.id ?? null,
  );

  const locale = snapshot.language || "pt-PT";
  const currency = product?.currency ?? snapshot.currency ?? "EUR";

  const money = React.useCallback(
    (cents: number) => formatMoney(cents, currency, locale),
    [currency, locale],
  );

  const currentPriceCents = React.useMemo(() => {
    if (!product) return 0;
    const variant = product.variants.find((v) => v.id === variantId);
    return variant?.priceCents ?? product.priceCents;
  }, [product, variantId]);

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
    if (variantId) params.set("variant", variantId);

    // Parâmetros padrão da página entram só onde ainda não há valor vindo
    // do anúncio — o que o anunciante mandou tem prioridade.
    for (const [key, value] of new URLSearchParams(snapshot.tracking.defaultUtm)) {
      if (!params.has(key)) params.set(key, value);
    }

    return `/checkout/${product.checkoutSlug}?${params.toString()}`;
  }, [product, quantity, pageId, variantId, snapshot.tracking.defaultUtm]);

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
      track("select_variant", { blockId: value });
    },
    track,
    money,
    checkoutHref,
    currentPriceCents,
  };

  React.useEffect(() => {
    if (mode !== "public") return;
    track("page_view");
    track("view_content", { valueCents: currentPriceCents });
    // Só na montagem: recontar a cada mudança de preço inflaria as visitas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const visibleBlocks = snapshot.content.blocks.filter((block) => !block.hidden);

  return (
    <RuntimeContext.Provider value={runtime}>
      <style dangerouslySetInnerHTML={{ __html: LANDING_BASE_CSS }} />
      {snapshot.customCode.css ? (
        <style dangerouslySetInnerHTML={{ __html: snapshot.customCode.css }} />
      ) : null}
      <div className={cn("lp-root min-h-svh", className)} style={themeToCssVars(snapshot.theme)}>
        {visibleBlocks.map((block) => {
          const node = <RenderBlock key={block.id} block={block} />;
          return wrapBlock ? (
            <React.Fragment key={block.id}>{wrapBlock(block, node)}</React.Fragment>
          ) : (
            node
          );
        })}
      </div>
    </RuntimeContext.Provider>
  );
}
