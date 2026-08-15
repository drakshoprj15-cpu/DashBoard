import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CheckoutCard } from "@/features/payment-links/checkout-card";
import {
  DEFAULT_PAYMENT_LINK_APPEARANCE,
  DEFAULT_PAYMENT_LINK_BRAND,
  DEFAULT_PAYMENT_LINK_SEO,
  DEFAULT_PAYMENT_LINK_SUCCESS,
  type PublicPaymentLink,
} from "@/features/payment-links/types";
import { DEFAULT_CUSTOMER_FIELDS } from "@/validations/payment-link";

const paymentLink: PublicPaymentLink = {
  slug: "servico-contratado",
  title: "Pagamento do pedido",
  description: "Confirme os seus dados antes de escolher como pagar.",
  amountCents: 854,
  currency: "EUR",
  product: {
    name: "Serviço contratado",
    description: "Resumo transparente do serviço adquirido.",
    imageUrl: "",
    quantity: 1,
    unitPriceCents: 854,
  },
  paymentMethods: ["mbway", "multibanco"],
  brand: {
    ...DEFAULT_PAYMENT_LINK_BRAND,
    companyName: "Sua Empresa",
  },
  appearance: DEFAULT_PAYMENT_LINK_APPEARANCE,
  fields: {
    requestName: "required",
    requestEmail: "required",
    requestPhone: "optional",
    requiresAddress: false,
    requestShipping: false,
    shippingOptions: [],
    customerFields: DEFAULT_CUSTOMER_FIELDS,
  },
  success: DEFAULT_PAYMENT_LINK_SUCCESS,
  seo: DEFAULT_PAYMENT_LINK_SEO,
};

describe("CheckoutCard", () => {
  it("separa os dados do cliente da etapa de pagamento", () => {
    const onSubmit = vi.fn();
    render(<CheckoutCard link={paymentLink} onSubmit={onSubmit} />);

    expect(screen.getByText("8,54 €")).toBeTruthy();
    expect(screen.getByText("Serviço contratado")).toBeTruthy();
    expect(screen.getByText("Continuar para pagamento")).toBeTruthy();
    expect(screen.queryByText("Forma de pagamento")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: /Nome/ }), {
      target: { value: "Maria" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Email/ }), {
      target: { value: "maria@example.com" },
    });
    fireEvent.click(screen.getByText("Continuar para pagamento"));

    expect(screen.getByText("Forma de pagamento")).toBeTruthy();
    expect(screen.getByText("MB WAY")).toBeTruthy();
    expect(screen.getByText("Multibanco")).toBeTruthy();
    expect(screen.getByText("Voltar aos dados")).toBeTruthy();

    fireEvent.change(
      screen.getByRole("textbox", { name: /Telemóvel MB WAY/ }),
      {
        target: { value: "912345678" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Pagar agora" }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Maria",
        email: "maria@example.com",
        phone: "912 345 678",
        method: "mbway",
      }),
    );
  });

  it("permite navegar pelo preview sem iniciar uma cobrança", () => {
    const onSubmit = vi.fn();
    render(<CheckoutCard link={paymentLink} disabled onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText("Continuar para pagamento"));

    const payButton = screen.getByRole("button", { name: "Pagar agora" });
    expect(payButton.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(payButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("volta para os dados do cliente sem perder o conteúdo", () => {
    render(<CheckoutCard link={paymentLink} />);

    const nameField = screen.getByRole("textbox", { name: /Nome/ });
    fireEvent.change(nameField, { target: { value: "João" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Email/ }), {
      target: { value: "joao@example.com" },
    });
    fireEvent.click(screen.getByText("Continuar para pagamento"));
    fireEvent.click(screen.getByText("Voltar aos dados"));

    expect(
      (screen.getByRole("textbox", { name: /Nome/ }) as HTMLInputElement).value,
    ).toBe("João");
  });
});
