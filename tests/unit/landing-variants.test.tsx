import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { LandingRenderer } from "@/features/landing-pages/render/landing-renderer";
import { DEFAULT_THEME } from "@/features/landing-pages/defaults";
import { createBlock } from "@/features/landing-pages/block-catalog";
import type {
  BlockPropValue,
  LandingBlock,
  LandingProductData,
  LandingProductVariant,
  LandingSnapshot,
} from "@/features/landing-pages/types";

/**
 * Cenário do pedido do utilizador: uma cadeira gamer em cinco cores, cada uma
 * com preço, estoque e fotos próprios. Branco entra esgotado de propósito.
 */
function variant(
  overrides: Partial<LandingProductVariant> & {
    publicId: string;
    name: string;
  },
): LandingProductVariant {
  return {
    id: `id-${overrides.publicId}`,
    priceCents: null,
    compareAtPriceCents: 22990,
    stockQuantity: 5,
    trackInventory: true,
    allowBackorder: false,
    status: "active",
    sku: null,
    attributes: { Cor: overrides.name },
    gallery: [],
    isDefault: false,
    weightGrams: null,
    purchaseLimit: null,
    ...overrides,
  };
}

const VARIANTS: LandingProductVariant[] = [
  variant({
    publicId: "preto",
    name: "Preto",
    priceCents: 3990,
    stockQuantity: 7,
    sku: "CAD-PRETO",
    isDefault: true,
    hexColor: "#111111",
    imageUrl: "https://cdn.example/preta-1.jpg",
    gallery: [
      "https://cdn.example/preta-1.jpg",
      "https://cdn.example/preta-2.jpg",
    ],
  }),
  variant({
    publicId: "azul",
    name: "Azul",
    priceCents: 5990,
    stockQuantity: 3,
    sku: "CAD-AZUL",
    imageUrl: "https://cdn.example/azul-1.jpg",
    gallery: ["https://cdn.example/azul-1.jpg"],
  }),
  variant({
    publicId: "bege",
    name: "Bege",
    priceCents: 5393,
    stockQuantity: 5,
    sku: "CAD-BEGE",
    imageUrl: "https://cdn.example/bege-1.jpg",
    gallery: ["https://cdn.example/bege-1.jpg"],
  }),
  variant({
    publicId: "branco",
    name: "Branco",
    priceCents: 4990,
    stockQuantity: 0,
    sku: "CAD-BRANCO",
    imageUrl: "https://cdn.example/branco-1.jpg",
    gallery: ["https://cdn.example/branco-1.jpg"],
  }),
  variant({
    publicId: "rosa",
    name: "Rosa",
    priceCents: 6990,
    stockQuantity: 2,
    sku: "CAD-ROSA",
    imageUrl: "https://cdn.example/rosa-1.jpg",
    gallery: ["https://cdn.example/rosa-1.jpg"],
  }),
];

const PRODUCT: LandingProductData = {
  id: "prod-1",
  slug: "cadeira-gamer",
  name: "Cadeira Gamer",
  shortDescription: "Conforto para longas sessões",
  description: "",
  priceCents: 3990,
  comparePriceCents: 22990,
  currency: "EUR",
  mainImageUrl: "https://cdn.example/generica.jpg",
  gallery: ["https://cdn.example/generica.jpg"],
  variants: VARIANTS,
  variantOptionName: "Cor",
  trackInventory: true,
  stockQuantity: 17,
  checkoutSlug: "cadeira-gamer",
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
      countGeneratedOrdersAsPurchase: null,
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

/** Página completa: seletor, galeria, preço, estoque e botão. */
function renderPage(initialVariantPublicId?: string) {
  return render(
    <LandingRenderer
      snapshot={snapshotWith([
        block("variants"),
        block("gallery"),
        block("price"),
        block("stock"),
        block("quantity"),
        block("buy_button", { label: "Comprar agora" }),
      ])}
      reviews={[]}
      pageId="11111111-2222-4333-8444-555555555555"
      initialVariantPublicId={initialVariantPublicId}
    />,
  );
}

function chooseColor(name: string) {
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(name, "i") }));
}

/** Texto de um bloco específico — evita confundir o preço do card da opção
 *  com o preço grande do bloco de preço. */
function blockText(container: HTMLElement, type: string): string {
  return (
    container.querySelector(`[data-block-type="${type}"]`)?.textContent ?? ""
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true })))),
  );
  window.history.replaceState(null, "", "/lp/cadeira");
});

describe("seletor de cores na landing page", () => {
  it("abre na variação padrão do catálogo", () => {
    const { container } = renderPage();

    const selected = screen.getByRole("radio", { checked: true });
    expect(within(selected).getByText("Preto")).toBeTruthy();
    expect(blockText(container, "price")).toContain("39,90");
    expect(
      container.querySelector('img[src="https://cdn.example/preta-1.jpg"]'),
    ).toBeTruthy();
  });

  it("troca preço, desconto e economia ao escolher cada cor", () => {
    const { container } = renderPage();

    chooseColor("Azul");
    expect(blockText(container, "price")).toContain("59,90");
    expect(blockText(container, "price")).toContain("-74%");

    chooseColor("Bege");
    expect(blockText(container, "price")).toContain("53,93");
    expect(blockText(container, "price")).toContain("-77%");

    chooseColor("Rosa");
    const price = blockText(container, "price");
    expect(price).toContain("69,90");
    expect(price).toContain("-70%");
    expect(price).toContain("Está a poupar 160,00");
  });

  it("troca a imagem principal e a galeria junto com a cor", () => {
    const { container } = renderPage();

    const gallery = () =>
      container.querySelector('[data-block-type="gallery"]') as HTMLElement;

    expect(
      gallery().querySelector('img[src="https://cdn.example/preta-1.jpg"]'),
    ).toBeTruthy();

    chooseColor("Rosa");

    // A galeria passa a mostrar só as fotos da nova cor; as da anterior sobram
    // apenas como miniatura do seletor, fora deste bloco.
    expect(
      gallery().querySelector('img[src="https://cdn.example/rosa-1.jpg"]'),
    ).toBeTruthy();
    expect(
      gallery().querySelector('img[src="https://cdn.example/preta-1.jpg"]'),
    ).toBeNull();
    expect(
      gallery().querySelector('img[src="https://cdn.example/preta-2.jpg"]'),
    ).toBeNull();
  });

  it("mostra o estoque real de cada cor", () => {
    renderPage();

    expect(screen.getByText(/7 unidades de Preto/)).toBeTruthy();

    chooseColor("Rosa");
    expect(screen.getByText(/2 unidades de Rosa/)).toBeTruthy();
  });

  it("bloqueia a cor esgotada e mantém o botão desativado", () => {
    const { container } = renderPage();

    const branco = screen.getByRole("radio", { name: /Branco/i });
    expect(branco.getAttribute("aria-disabled")).toBe("true");
    expect(within(branco).getAllByText("Esgotado").length).toBeGreaterThan(0);

    // Clicar numa opção esgotada não muda a seleção nem o preço.
    fireEvent.click(branco);
    expect(blockText(container, "price")).toContain("39,90");
  });

  it("leva a cor escolhida para o checkout, não o id interno", () => {
    renderPage();
    chooseColor("Bege");

    const href =
      screen
        .getByRole("link", { name: "Comprar agora" })
        .getAttribute("href") ?? "";

    expect(href).toContain("/checkout/cadeira-gamer");
    expect(href).toContain("variant=bege");
    expect(href).not.toContain("id-bege");
  });

  it("limita a quantidade ao estoque da cor escolhida", () => {
    const { container } = renderPage();
    chooseColor("Rosa");

    const aumentar = screen.getByRole("button", {
      name: "Aumentar quantidade",
    });
    fireEvent.click(aumentar);
    fireEvent.click(aumentar);
    fireEvent.click(aumentar);

    // Rosa tem 2 unidades: a quantidade não passa disso.
    expect(blockText(container, "quantity")).toContain("2");
  });

  it("abre na cor pedida pela URL quando ela é válida", () => {
    const { container } = renderPage("rosa");

    const selected = screen.getByRole("radio", { checked: true });
    expect(within(selected).getByText("Rosa")).toBeTruthy();
    expect(blockText(container, "price")).toContain("69,90");
  });

  it("cai na variação padrão quando a URL pede uma cor esgotada", () => {
    const { container } = renderPage("branco");
    expect(
      within(screen.getByRole("radio", { checked: true })).getByText("Preto"),
    ).toBeTruthy();
    expect(blockText(container, "price")).toContain("39,90");
  });

  it("cai na variação padrão quando a URL pede uma cor inexistente", () => {
    const { container } = renderPage("verde-limao");
    expect(
      within(screen.getByRole("radio", { checked: true })).getByText("Preto"),
    ).toBeTruthy();
    expect(blockText(container, "price")).toContain("39,90");
  });

  it("navega entre as cores pelo teclado, pulando as esgotadas", () => {
    const { container } = renderPage();

    const grupo = screen.getByRole("radiogroup", { name: "Cor" });
    const opcoes = within(grupo).getAllByRole("radio");

    // Da terceira (Bege) para a direita: Branco está esgotado, salta ao Rosa.
    fireEvent.keyDown(opcoes[2], { key: "ArrowRight" });
    expect(blockText(container, "price")).toContain("69,90");
  });

  it("registra o evento de troca de variação com preço e SKU", () => {
    renderPage();
    chooseColor("Azul");

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const variantEvent = calls
      .map(([, init]) => JSON.parse((init as RequestInit).body as string))
      .find((body) => body.event === "select_variant");

    expect(variantEvent).toBeTruthy();
    expect(variantEvent.valueCents).toBe(5990);
    expect(variantEvent.variant.id).toBe("azul");
    expect(variantEvent.variant.sku).toBe("CAD-AZUL");
  });
});
