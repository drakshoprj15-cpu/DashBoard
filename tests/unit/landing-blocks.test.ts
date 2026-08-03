import { describe, expect, it } from "vitest";

import {
  BLOCK_CATALOG,
  createBlock,
  getBlockDef,
} from "@/features/landing-pages/block-catalog";
import {
  LANDING_TEMPLATES,
  buildTemplateBlocks,
} from "@/features/landing-pages/templates";
import {
  BLOCK_TYPES,
  propBool,
  propList,
  propNumber,
  propPairs,
  propText,
} from "@/features/landing-pages/types";
import { validateForPublish } from "@/features/landing-pages/publish-rules";
import { landingContentSchema } from "@/validations/landing-page";
import { checkRateLimit } from "@/features/landing-pages/events";

describe("catálogo de blocos", () => {
  it("descreve todos os tipos declarados", () => {
    for (const type of BLOCK_TYPES) {
      expect(getBlockDef(type), `bloco ${type} sem definição`).not.toBeNull();
    }
  });

  it("declara um valor inicial para cada campo do inspetor", () => {
    for (const def of Object.values(BLOCK_CATALOG)) {
      for (const field of def.fields) {
        expect(
          field.key in def.defaults,
          `${def.type}.${field.key} sem valor padrão`,
        ).toBe(true);
      }
    }
  });

  it("cria blocos com identificador próprio e os valores do catálogo", () => {
    const first = createBlock("hero");
    const second = createBlock("hero");

    expect(first.id).not.toBe(second.id);
    expect(first.type).toBe("hero");
    expect(first.props.layout).toBe("image-right");
  });
});

describe("modelos", () => {
  it("geram documentos válidos segundo o schema de conteúdo", () => {
    for (const template of LANDING_TEMPLATES) {
      const blocks = buildTemplateBlocks(template.id);
      const parsed = landingContentSchema.safeParse({ blocks });
      expect(parsed.success, `modelo ${template.id} inválido`).toBe(true);
    }
  });

  it("não trazem depoimentos, avaliações ou contagens inventadas", () => {
    for (const template of LANDING_TEMPLATES) {
      for (const block of buildTemplateBlocks(template.id)) {
        if (block.type === "testimonials" || block.type === "comparison") {
          expect(propText(block.props, "items")).toBe("");
        }
        if (block.type === "countdown") {
          expect(propText(block.props, "endsAt")).toBe("");
        }
      }
    }
  });

  it("cai no primeiro modelo quando o identificador não existe", () => {
    expect(buildTemplateBlocks("inexistente").length).toBeGreaterThan(0);
  });
});

describe("leitura de propriedades", () => {
  it("devolve o valor padrão quando o tipo não confere", () => {
    expect(propText({ a: 5 }, "a", "padrão")).toBe("padrão");
    expect(propNumber({ a: "não é número" }, "a", 7)).toBe(7);
    expect(propBool({ a: "sim" }, "a", true)).toBe(true);
  });

  it("aceita número escrito como texto", () => {
    expect(propNumber({ a: "12" }, "a")).toBe(12);
  });

  it("interpreta listas escritas linha a linha", () => {
    expect(propList({ items: "um\n\ndois\n  três  " }, "items")).toEqual([
      "um",
      "dois",
      "três",
    ]);
  });

  it("interpreta pares separados por barra vertical", () => {
    expect(propPairs({ items: "Cor | Preto\nGarantia | 2 anos" }, "items")).toEqual([
      ["Cor", "Preto"],
      ["Garantia", "2 anos"],
    ]);
  });

  it("mantém barras verticais extras no valor do par", () => {
    expect(propPairs({ items: "Link | a | b" }, "items")).toEqual([
      ["Link", "a | b"],
    ]);
  });
});

describe("validação de publicação", () => {
  const withBuyButton = {
    slug: "lp-teste",
    productId: "produto-1",
    product: { checkoutSlug: "produto-1" },
    content: { blocks: [{ type: "buy_button" }, { type: "price" }] },
  };

  it("aprova uma página completa", () => {
    expect(validateForPublish(withBuyButton)).toHaveLength(0);
  });

  it("recusa página sem blocos visíveis", () => {
    const issues = validateForPublish({
      ...withBuyButton,
      content: { blocks: [{ type: "buy_button", hidden: true }, { type: "price", hidden: true }] },
    });
    expect(issues.some((issue) => issue.field === "blocos")).toBe(true);
  });

  it("recusa botão de compra sem produto vinculado", () => {
    const issues = validateForPublish({
      ...withBuyButton,
      productId: null,
      product: null,
    });
    expect(issues.some((issue) => issue.field === "produto")).toBe(true);
  });

  it("recusa produto vinculado sem botão de compra", () => {
    const issues = validateForPublish({
      ...withBuyButton,
      content: { blocks: [{ type: "price" }] },
    });
    expect(issues.some((issue) => issue.field === "checkout")).toBe(true);
  });

  it("recusa quando o checkout do produto não resolve", () => {
    const issues = validateForPublish({ ...withBuyButton, product: null });
    expect(issues.some((issue) => issue.field === "checkout")).toBe(true);
  });
});

describe("limite de taxa dos eventos públicos", () => {
  it("permite dentro da janela e bloqueia depois do limite", () => {
    const key = `teste-${Math.random()}`;
    const now = 1_000_000;

    for (let i = 0; i < 120; i += 1) {
      expect(checkRateLimit(key, now)).toBe(true);
    }
    expect(checkRateLimit(key, now)).toBe(false);
  });

  it("liberta o limite depois de a janela expirar", () => {
    const key = `teste-${Math.random()}`;
    const now = 2_000_000;

    for (let i = 0; i < 120; i += 1) checkRateLimit(key, now);
    expect(checkRateLimit(key, now)).toBe(false);
    expect(checkRateLimit(key, now + 61_000)).toBe(true);
  });

  it("conta cada visitante separadamente", () => {
    const now = 3_000_000;
    for (let i = 0; i < 120; i += 1) checkRateLimit("ip-a", now);
    expect(checkRateLimit("ip-a", now)).toBe(false);
    expect(checkRateLimit("ip-b", now)).toBe(true);
  });
});
