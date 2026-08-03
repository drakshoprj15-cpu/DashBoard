import { describe, expect, it } from "vitest";

import { checkoutSchema } from "@/validations/checkout";
import {
  bulkActionSchema,
  saveOptionsSchema,
  variantInputSchema,
} from "@/validations/product-variants";

const UUID = "11111111-2222-4333-8444-555555555555";

const baseVariant = {
  optionValueIds: {},
  priceCents: "39,90",
  status: "active" as const,
};

describe("validação da variação", () => {
  it("converte preço com vírgula em centavos inteiros", () => {
    const parsed = variantInputSchema.parse(baseVariant);
    expect(parsed.priceCents).toBe(3990);
  });

  it("aceita ponto como separador decimal", () => {
    expect(
      variantInputSchema.parse({ ...baseVariant, priceCents: "53.93" })
        .priceCents,
    ).toBe(5393);
  });

  it("recusa preço anterior menor ou igual ao preço de venda", () => {
    const result = variantInputSchema.safeParse({
      ...baseVariant,
      priceCents: "59,90",
      compareAtPriceCents: "49,90",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain(
      "maior que o preço de venda",
    );
  });

  it("recusa preço negativo", () => {
    const result = variantInputSchema.safeParse({
      ...baseVariant,
      priceCents: "-10",
    });
    expect(result.success).toBe(false);
  });

  it("exige preço de venda", () => {
    const result = variantInputSchema.safeParse({
      ...baseVariant,
      priceCents: "",
    });
    expect(result.success).toBe(false);
  });

  it("recusa cor fora do formato #RRGGBB", () => {
    expect(
      variantInputSchema.safeParse({ ...baseVariant, hexColor: "vermelho" })
        .success,
    ).toBe(false);
    expect(
      variantInputSchema.parse({ ...baseVariant, hexColor: "#ec4899" })
        .hexColor,
    ).toBe("#EC4899");
  });

  it("recusa endereço de imagem que não seja http(s)", () => {
    expect(
      variantInputSchema.safeParse({
        ...baseVariant,
        mainImageUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("recusa estoque negativo", () => {
    expect(
      variantInputSchema.safeParse({ ...baseVariant, stockQuantity: "-3" })
        .success,
    ).toBe(false);
  });
});

describe("validação dos atributos", () => {
  it("recusa valores repetidos no mesmo atributo", () => {
    const result = saveOptionsSchema.safeParse({
      productId: UUID,
      hasVariants: true,
      options: [
        {
          name: "Cor",
          values: [{ value: "Preto" }, { value: "preto" }],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("repetido");
  });

  it("aceita as cinco cores da cadeira", () => {
    const result = saveOptionsSchema.safeParse({
      productId: UUID,
      hasVariants: true,
      options: [
        {
          name: "Cor",
          values: [
            { value: "Preto", hexColor: "#111111" },
            { value: "Azul", hexColor: "#1D4ED8" },
            { value: "Bege", hexColor: "#D8C3A5" },
            { value: "Branco", hexColor: "#FFFFFF" },
            { value: "Rosa", hexColor: "#EC4899" },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.options[0].values).toHaveLength(5);
  });

  it("recusa atributo sem valores", () => {
    const result = saveOptionsSchema.safeParse({
      productId: UUID,
      hasVariants: true,
      options: [{ name: "Cor", values: [] }],
    });
    expect(result.success).toBe(false);
  });
});

describe("ações em massa", () => {
  it("exige valor ao definir preço", () => {
    const result = bulkActionSchema.safeParse({
      productId: UUID,
      variantIds: [UUID],
      action: "set_price",
      priceCents: "",
    });
    expect(result.success).toBe(false);
  });

  it("aceita ativar sem valor", () => {
    const result = bulkActionSchema.safeParse({
      productId: UUID,
      variantIds: [UUID],
      action: "activate",
    });
    expect(result.success).toBe(true);
  });
});

describe("checkout com variação", () => {
  const validCheckout = {
    firstName: "Ana",
    lastName: "Silva",
    email: "ana@exemplo.pt",
    phone: "912345678",
    addressLine1: "Rua das Flores, 10",
    postalCode: "1234-567",
    city: "Lisboa",
    paymentMethod: "mbway",
    quantity: "1",
    productSlug: "cadeira-gamer",
  };

  it("aceita o identificador público da variação", () => {
    const parsed = checkoutSchema.parse({
      ...validCheckout,
      variantId: "rosa",
    });
    expect(parsed.variantId).toBe("rosa");
  });

  it("aceita compra sem variação", () => {
    expect(
      checkoutSchema.safeParse({ ...validCheckout, variantId: "" }).success,
    ).toBe(true);
  });

  it("recusa identificador de variação fora do formato esperado", () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      variantId: "../../admin",
    });
    expect(result.success).toBe(false);
  });

  it("não aceita preço vindo do formulário", () => {
    const parsed = checkoutSchema.parse({
      ...validCheckout,
      priceCents: "1",
      unitPriceCents: "1",
    });

    expect("priceCents" in parsed).toBe(false);
    expect("unitPriceCents" in parsed).toBe(false);
  });
});
