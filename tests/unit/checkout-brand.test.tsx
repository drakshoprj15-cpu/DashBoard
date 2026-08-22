import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CHECKOUT_BRAND_SIZE,
  CheckoutBrand,
} from "@/features/branding/checkout-brand";

describe("CheckoutBrand", () => {
  it("usa Minha Loja quando não existe uma logo configurada", () => {
    render(<CheckoutBrand logoUrl={null} storeName="" />);

    const fallback = screen.getByText("Minha Loja");
    expect(fallback).toBeTruthy();
    expect(fallback.className).toContain("text-[20px]");
    expect(fallback.className).toContain("leading-[25px]");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("mantém a imagem na área visual de 122 por 25 pixels", () => {
    render(
      <CheckoutBrand
        logoUrl="https://cdn.example.com/minha-loja.png"
        storeName="Minha Loja"
      />,
    );

    const logo = screen.getByRole("img", { name: "Minha Loja" });
    expect(logo.className).toContain(`h-[${CHECKOUT_BRAND_SIZE.height}px]`);
    expect(logo.className).toContain(`max-w-[${CHECKOUT_BRAND_SIZE.width}px]`);
  });

  it("volta para o nome da loja se a imagem não carregar", () => {
    render(
      <CheckoutBrand logoUrl="/logo-invalida.png" storeName="Minha Loja" />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Minha Loja" }));

    expect(screen.getByText("Minha Loja")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
