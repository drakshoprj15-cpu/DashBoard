import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { LandingRenderer } from "@/features/landing-pages/render/landing-renderer";
import { DEFAULT_THEME } from "@/features/landing-pages/defaults";
import { createBlock } from "@/features/landing-pages/block-catalog";
import type {
  BlockPropValue,
  LandingBlock,
  LandingProductData,
  LandingSnapshot,
} from "@/features/landing-pages/types";

const PRODUCT: LandingProductData = {
  id: "prod-1",
  slug: "cadeira-teste",
  name: "Cadeira de Teste",
  shortDescription: "Confortável e barata",
  description: "Descrição longa do produto.",
  priceCents: 4990,
  comparePriceCents: 9990,
  currency: "EUR",
  mainImageUrl: "https://cdn.example/cadeira.jpg",
  gallery: ["https://cdn.example/cadeira.jpg"],
  variants: [],
  trackInventory: false,
  stockQuantity: 0,
  checkoutSlug: "checkout-cadeira",
};

function snapshotWith(blocks: LandingBlock[]): LandingSnapshot {
  return {
    version: 1,
    publicName: "Loja Teste",
    logoUrl: null,
    faviconUrl: null,
    language: "pt-PT",
    currency: "EUR",
    content: { blocks },
    theme: DEFAULT_THEME,
    seo: {
      title: "",
      description: "",
      keywords: "",
      canonicalUrl: "",
      shareImageUrl: "",
      twitterCard: "summary_large_image",
      noIndex: false,
      productSchema: true,
    },
    tracking: {
      metaPixelId: "",
      tiktokPixelId: "",
      ga4MeasurementId: "",
      gtmContainerId: "",
      defaultUtm: "",
      inheritWorkspacePixels: true,
    },
    customCode: {
      headCode: "",
      bodyStartCode: "",
      bodyEndCode: "",
      css: "",
      javascript: "",
    },
    product: PRODUCT,
    publishedAt: new Date("2026-01-01").toISOString(),
  };
}

function block(
  type: Parameters<typeof createBlock>[0],
  props: Record<string, BlockPropValue> = {},
): LandingBlock {
  const created = createBlock(type);
  return { ...created, props: { ...created.props, ...props } };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true })))),
  );
});

describe("LandingRenderer", () => {
  it("mostra o preço do produto e o desconto calculado", () => {
    render(
      <LandingRenderer
        snapshot={snapshotWith([block("price")])}
        reviews={[]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(screen.getByText(/49,90/)).toBeTruthy();
    expect(screen.getByText("-50%")).toBeTruthy();
  });

  it("liga o botão de compra ao checkout real, com quantidade e origem", () => {
    render(
      <LandingRenderer
        snapshot={snapshotWith([block("buy_button", { label: "Comprar já" })])}
        reviews={[]}
        pageId="page-1"
      />,
    );

    const link = screen.getByRole("link", { name: "Comprar já" });
    const href = link.getAttribute("href") ?? "";

    expect(href).toContain("/checkout/checkout-cadeira");
    expect(href).toContain("qty=1");
    expect(href).toContain("lp=page-1");
  });

  it("não renderiza blocos ocultos", () => {
    const hidden: LandingBlock = { ...block("heading", { text: "Escondido" }), hidden: true };

    render(
      <LandingRenderer
        snapshot={snapshotWith([hidden, block("heading", { text: "Visível" })])}
        reviews={[]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(screen.queryByText("Escondido")).toBeNull();
    expect(screen.getByText("Visível")).toBeTruthy();
  });

  it("omite a contagem regressiva sem data configurada", () => {
    const { container } = render(
      <LandingRenderer
        snapshot={snapshotWith([block("countdown", { title: "Termina em" })])}
        reviews={[]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(container.querySelector('[data-block-type="countdown"]')).toBeNull();
  });

  it("mostra a contagem quando há uma data futura real", () => {
    const endsAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    render(
      <LandingRenderer
        snapshot={snapshotWith([block("countdown", { title: "Termina em", endsAt })])}
        reviews={[]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(screen.getByText("Termina em")).toBeTruthy();
    expect(screen.getByText("horas")).toBeTruthy();
  });

  it("mostra a mensagem de ausência quando não há avaliações reais", () => {
    render(
      <LandingRenderer
        snapshot={snapshotWith([
          block("reviews", { emptyMessage: "Ainda sem avaliações." }),
        ])}
        reviews={[]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(screen.getByText("Ainda sem avaliações.")).toBeTruthy();
  });

  it("lista as avaliações reais recebidas", () => {
    render(
      <LandingRenderer
        snapshot={snapshotWith([block("reviews")])}
        reviews={[
          {
            name: "Ana P.",
            location: "Porto",
            date: "2026-01-10",
            stars: 5,
            title: "Excelente",
            text: "Chegou antes do prazo.",
            helpful: 2,
            verifiedPurchase: true,
          },
        ]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(screen.getByText("Ana P.")).toBeTruthy();
    expect(screen.getByText("Compra verificada")).toBeTruthy();
  });

  it("higieniza o HTML personalizado antes de o inserir", () => {
    const { container } = render(
      <LandingRenderer
        snapshot={snapshotWith([
          block("custom_html", {
            html: '<p onclick="mau()">Olá</p><script>alert(1)</script>',
          }),
        ])}
        reviews={[]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("p")?.getAttribute("onclick")).toBeNull();
    expect(screen.getByText("Olá")).toBeTruthy();
  });

  it("não envia eventos no modo editor", () => {
    render(
      <LandingRenderer
        snapshot={snapshotWith([block("heading", { text: "Título" })])}
        reviews={[]}
        pageId="page-1"
        mode="editor"
      />,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("regista a visita na página publicada", () => {
    render(
      <LandingRenderer
        snapshot={snapshotWith([block("heading", { text: "Título" })])}
        reviews={[]}
        pageId="page-1"
      />,
    );

    expect(fetch).toHaveBeenCalled();
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/public/lp-events");
  });
});
