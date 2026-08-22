import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CheckoutFooter } from "@/features/checkout/checkout-footer";

describe("CheckoutFooter", () => {
  it("reproduz a estrutura completa com a identidade da loja", () => {
    render(
      <CheckoutFooter
        backgroundColor="#e30613"
        checkoutSlug="samsung-galaxy-a55-5g"
        productSlug="samsung-galaxy-a55-5g"
        storeName="Minha Loja"
        supportEmail="apoio@minhaloja.pt"
      />,
    );

    expect(screen.getByText("Minha Loja")).toBeTruthy();
    expect(screen.getByText("Loja")).toBeTruthy();
    expect(screen.getByText("Apoio ao Cliente")).toBeTruthy();
    expect(screen.getByText("Informações Legais")).toBeTruthy();
    expect(screen.getByAltText("MB WAY")).toBeTruthy();
    expect(screen.getByAltText("Multibanco")).toBeTruthy();
    expect(screen.getByText("14 dias para devolver")).toBeTruthy();
  });

  it("usa somente métodos aceites e mantém links públicos reais", () => {
    render(
      <CheckoutFooter
        backgroundColor="#e30613"
        checkoutSlug="samsung-galaxy-a55-5g"
        productSlug="samsung-galaxy-a55-5g"
        storeName="Minha Loja"
        supportEmail="apoio@minhaloja.pt"
      />,
    );

    expect(screen.queryByText("Visa")).toBeNull();
    expect(screen.queryByText("Mastercard")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Contactos" }).getAttribute("href"),
    ).toBe("mailto:apoio@minhaloja.pt");
    expect(
      screen
        .getByRole("link", { name: "Página do produto" })
        .getAttribute("href"),
    ).toBe("/p/samsung-galaxy-a55-5g");
    expect(
      screen
        .getByRole("link", { name: "Envios e Entregas" })
        .getAttribute("href"),
    ).toBe("/legal/envios");
  });
});
