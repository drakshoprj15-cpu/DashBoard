import type { CSSProperties } from "react";

import type { BlockStyle, LandingTheme } from "../types";

const SHADOWS: Record<LandingTheme["shadow"], string> = {
  none: "none",
  soft: "0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.06)",
  medium: "0 2px 4px rgba(0,0,0,.08), 0 10px 24px rgba(0,0,0,.10)",
  strong: "0 4px 8px rgba(0,0,0,.10), 0 18px 40px rgba(0,0,0,.16)",
};

/**
 * Tema como variáveis CSS num único elemento raiz.
 *
 * Tudo o que o renderer desenha lê destas variáveis, então mudar uma cor no
 * editor repinta a pré-visualização inteira sem recriar componente nenhum —
 * é o que permite o preview em tempo real ser barato.
 */
export function themeToCssVars(theme: LandingTheme): CSSProperties {
  const fontStack = (font: string) =>
    `${font}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  return {
    "--lp-primary": theme.primaryColor,
    "--lp-secondary": theme.secondaryColor,
    "--lp-bg": theme.backgroundColor,
    "--lp-text": theme.textColor,
    "--lp-button": theme.buttonColor,
    "--lp-button-text": theme.buttonTextColor,
    "--lp-header-bg": theme.headerBackground,
    "--lp-header-text": theme.headerTextColor,
    "--lp-footer-bg": theme.footerBackground,
    "--lp-footer-text": theme.footerTextColor,
    "--lp-variant-selected": theme.variantSelectedColor,
    "--lp-heading-font": fontStack(theme.headingFont),
    "--lp-body-font": fontStack(theme.bodyFont),
    "--lp-radius": `${theme.radius}px`,
    "--lp-shadow": SHADOWS[theme.shadow] ?? SHADOWS.soft,
    "--lp-max-width": `${theme.maxWidth}px`,
    "--lp-muted": theme.colorScheme === "dark" ? "#A1A1AA" : "#71717A",
    "--lp-border":
      theme.colorScheme === "dark"
        ? "rgba(255,255,255,.14)"
        : "rgba(0,0,0,.10)",
    "--lp-surface":
      theme.colorScheme === "dark" ? "rgba(255,255,255,.05)" : "#FAFAFA",
    backgroundColor: "var(--lp-bg)",
    color: "var(--lp-text)",
    fontFamily: "var(--lp-body-font)",
  } as CSSProperties;
}

/** Estilo do botão principal conforme a preferência do tema. */
export function buttonStyle(theme: LandingTheme): CSSProperties {
  const base: CSSProperties = {
    borderRadius: "var(--lp-radius)",
    fontWeight: 700,
    transition: "filter .15s ease, background-color .15s ease",
  };

  if (theme.buttonStyle === "outline") {
    return {
      ...base,
      backgroundColor: "transparent",
      color: "var(--lp-button)",
      border: "2px solid var(--lp-button)",
    };
  }
  if (theme.buttonStyle === "soft") {
    return {
      ...base,
      backgroundColor: "color-mix(in srgb, var(--lp-button) 16%, transparent)",
      color: "var(--lp-button)",
      border: "1px solid transparent",
    };
  }
  return {
    ...base,
    backgroundColor: "var(--lp-button)",
    color: "var(--lp-button-text)",
    border: "1px solid transparent",
  };
}

/** Converte o estilo por bloco em CSS embutido. */
export function blockStyleToCss(style: BlockStyle | undefined): CSSProperties {
  if (!style) return {};
  return {
    ...(style.background ? { backgroundColor: style.background } : {}),
    ...(style.textColor ? { color: style.textColor } : {}),
    ...(typeof style.paddingTop === "number"
      ? { paddingTop: `${style.paddingTop}px` }
      : {}),
    ...(typeof style.paddingBottom === "number"
      ? { paddingBottom: `${style.paddingBottom}px` }
      : {}),
    ...(style.align ? { textAlign: style.align } : {}),
  };
}

/**
 * Classe de visibilidade por dispositivo. Usa utilitários do Tailwind já
 * presentes no projeto — nada de media query gerada em tempo de execução.
 */
export function visibilityClass(style: BlockStyle | undefined): string {
  if (style?.visibility === "desktop") return "hidden md:block";
  if (style?.visibility === "mobile") return "block md:hidden";
  return "";
}

export function animationClass(style: BlockStyle | undefined): string {
  if (style?.animation === "fade") return "lp-anim-fade";
  if (style?.animation === "rise") return "lp-anim-rise";
  return "";
}

/**
 * CSS global da página pública. Fica aqui, e não no `globals.css`, porque
 * só se aplica dentro de uma landing renderizada — o painel não carrega isto.
 */
export const LANDING_BASE_CSS = `
.lp-root h1, .lp-root h2, .lp-root h3 { font-family: var(--lp-heading-font); letter-spacing: -0.02em; }
.lp-root a { color: inherit; }
.lp-root :focus-visible { outline: 3px solid var(--lp-primary); outline-offset: 2px; }
.lp-anim-fade { animation: lp-fade .5s ease both; }
.lp-anim-rise { animation: lp-rise .5s ease both; }
@keyframes lp-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes lp-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .lp-anim-fade, .lp-anim-rise { animation: none; }
}
`.trim();
