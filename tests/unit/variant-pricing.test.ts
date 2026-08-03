import { describe, expect, it } from "vitest";

import {
  buildOptionsKey,
  buildPriceView,
  buildPublicId,
  buildVariantName,
  cartesian,
  discountPercent,
  effectivePriceCents,
  isPurchasable,
  maxPurchasableQuantity,
  savingsCents,
  suggestSku,
  uniquePublicId,
} from "@/features/variants/pricing";

/** Preços da cadeira usados como exemplo pelo utilizador (em centavos). */
const CADEIRA = {
  preto: 3990,
  azul: 5990,
  bege: 5393,
  branco: 4990,
  rosa: 6990,
  anterior: 22990,
};

describe("desconto e economia por variação", () => {
  it("calcula o percentual arredondado de cada cor", () => {
    expect(discountPercent(CADEIRA.preto, CADEIRA.anterior)).toBe(83);
    expect(discountPercent(CADEIRA.azul, CADEIRA.anterior)).toBe(74);
    expect(discountPercent(CADEIRA.bege, CADEIRA.anterior)).toBe(77);
    expect(discountPercent(CADEIRA.branco, CADEIRA.anterior)).toBe(78);
    expect(discountPercent(CADEIRA.rosa, CADEIRA.anterior)).toBe(70);
  });

  it("não inventa desconto quando o preço anterior é menor ou igual", () => {
    expect(discountPercent(5990, 5990)).toBeNull();
    expect(discountPercent(5990, 4990)).toBeNull();
    expect(discountPercent(5990, null)).toBeNull();
    expect(discountPercent(5990, undefined)).toBeNull();
  });

  it("economiza exatamente a diferença entre os dois preços", () => {
    expect(savingsCents(CADEIRA.preto, CADEIRA.anterior)).toBe(19000);
    expect(savingsCents(5990, 5990)).toBe(0);
  });

  it("mantém preço, riscado, percentual e economia coerentes", () => {
    const view = buildPriceView(CADEIRA.rosa, CADEIRA.anterior);
    expect(view.priceCents).toBe(6990);
    expect(view.compareAtPriceCents).toBe(22990);
    expect(view.discountPercent).toBe(70);
    expect(view.savingsCents).toBe(16000);
    expect(view.showCompareAt).toBe(true);
  });

  it("esconde riscado, percentual e economia ao mesmo tempo", () => {
    const view = buildPriceView(5990, 4990);
    expect(view.compareAtPriceCents).toBeNull();
    expect(view.discountPercent).toBeNull();
    expect(view.savingsCents).toBe(0);
    expect(view.showCompareAt).toBe(false);
  });

  it("usa o preço do produto quando a variação não tem preço próprio", () => {
    expect(effectivePriceCents(null, 4990)).toBe(4990);
    expect(effectivePriceCents(6990, 4990)).toBe(6990);
    expect(effectivePriceCents(0, 4990)).toBe(0);
  });
});

describe("disponibilidade da variação", () => {
  const base = {
    status: "active" as const,
    stockQuantity: 7,
    trackInventory: true,
    allowBackorder: false,
  };

  it("permite comprar dentro do estoque", () => {
    expect(isPurchasable(base, 7)).toBe(true);
    expect(isPurchasable(base, 8)).toBe(false);
  });

  it("bloqueia esgotada, indisponível e arquivada", () => {
    expect(isPurchasable({ ...base, stockQuantity: 0 })).toBe(false);
    expect(isPurchasable({ ...base, status: "sold_out" })).toBe(false);
    expect(isPurchasable({ ...base, status: "unavailable" })).toBe(false);
    expect(isPurchasable({ ...base, archivedAt: new Date() })).toBe(false);
  });

  it("aceita venda sem estoque só quando autorizada", () => {
    expect(
      isPurchasable({ ...base, stockQuantity: 0, allowBackorder: true }),
    ).toBe(true);
    expect(
      isPurchasable({ ...base, stockQuantity: 0, trackInventory: false }),
    ).toBe(true);
  });

  it("limita a quantidade ao menor entre estoque, limite e teto do checkout", () => {
    expect(maxPurchasableQuantity({ ...base, stockQuantity: 2 })).toBe(2);
    expect(maxPurchasableQuantity({ ...base, purchaseLimit: 3 })).toBe(3);
    expect(maxPurchasableQuantity({ ...base, stockQuantity: 50 })).toBe(10);
    expect(maxPurchasableQuantity({ ...base, status: "sold_out" })).toBe(0);
  });
});

describe("combinações e identificadores", () => {
  it("gera a mesma chave independentemente da ordem dos atributos", () => {
    const a = buildOptionsKey([
      { optionName: "Cor", value: "Preto" },
      { optionName: "Tamanho", value: "M" },
    ]);
    const b = buildOptionsKey([
      { optionName: "Tamanho", value: "M" },
      { optionName: "Cor", value: "Preto" },
    ]);

    expect(a).toBe("cor:preto|tamanho:m");
    expect(a).toBe(b);
  });

  it("normaliza acentos na chave da combinação", () => {
    expect(
      buildOptionsKey([{ optionName: "Cor", value: "Cinza Grafite" }]),
    ).toBe("cor:cinza-grafite");
  });

  it("monta a matriz Cor × Tamanho sem repetir combinações", () => {
    const combos = cartesian([
      ["Preto", "Branco"],
      ["P", "M", "G"],
    ]);

    expect(combos).toHaveLength(6);
    const keys = combos.map((combo) =>
      buildOptionsKey([
        { optionName: "Cor", value: combo[0] },
        { optionName: "Tamanho", value: combo[1] },
      ]),
    );
    expect(new Set(keys).size).toBe(6);
  });

  it("gera nome legível da combinação", () => {
    expect(
      buildVariantName([
        { optionName: "Cor", value: "Preto" },
        { optionName: "Tamanho", value: "M" },
      ]),
    ).toBe("Preto · M");
  });

  it("sugere SKU a partir do produto e dos valores", () => {
    expect(suggestSku("cadeira-gamer", ["Preto", "M"])).toBe(
      "CADEIRAGAMER-PRETO-M",
    );
  });

  it("cria identificador público legível e único no produto", () => {
    const taken = new Set(["preto"]);
    const first = buildPublicId(
      [{ optionName: "Cor", value: "Preto" }],
      "Preto",
    );

    expect(first).toBe("preto");
    expect(uniquePublicId(first, taken)).toBe("preto-2");
    expect(uniquePublicId("rosa", taken)).toBe("rosa");
  });
});
