import { describe, expect, it } from "vitest";

import { SEGMENTS } from "@/features/emails/types";

describe("segmentos de email", () => {
  it("apresenta compras pagas vindas de pedidos ou da aba Clientes", () => {
    const paid = SEGMENTS.find((segment) => segment.key === "paid");

    expect(paid).toEqual({
      key: "paid",
      label: "Compras pagas",
      description:
        "Clientes com pedido pago ou pagamento informado na aba Clientes",
    });
  });

  it("mantém o público pago identificado para o atalho da aba Clientes", () => {
    expect(SEGMENTS.some((segment) => segment.key === "paid")).toBe(true);
  });

  it("identifica Todos os clientes como a base consolidada de Clientes", () => {
    expect(SEGMENTS.find((segment) => segment.key === "all")).toEqual({
      key: "all",
      label: "Todos os clientes",
      description: "Base consolidada da aba Clientes",
    });
  });
});
