import { describe, expect, it } from "vitest";

import { normalizeMilluniCustomers } from "@/features/integrations/milluni/normalize";

describe("normalizeMilluniCustomers", () => {
  it("mantém apenas compradores pagos e deduplica pelo e-mail", () => {
    const result = normalizeMilluniCustomers({
      encomendas: [
        {
          id: "old-order",
          referencia: "MIL-1",
          estado: "pago",
          email: " Cliente@Example.com ",
          nome: "Ana",
          apelido: "Silva",
          telefone: "+351 912 345 678",
          createdAt: "2026-08-01T10:00:00.000Z",
          pagoEm: "2026-08-01T10:05:00.000Z",
          itens: [{ nome: "Produto antigo", qtd: 1 }],
        },
        {
          id: "pending-order",
          estado: "pendente",
          email: "lead@example.com",
          createdAt: "2026-08-02T10:00:00.000Z",
        },
        {
          id: "new-order",
          referencia: "MIL-2",
          estado: "PAGO",
          email: "cliente@example.com",
          nome: "Ana Maria",
          apelido: "Silva",
          createdAt: "2026-08-10T10:00:00.000Z",
          pagoEm: "2026-08-10T10:01:00.000Z",
          itens: [{ nome: "Produto novo", qtd: 1 }],
          morada: {
            morada: "Rua Central, 10",
            cp: "1000-100",
            localidade: "Lisboa",
            distrito: "Lisboa",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      scannedOrders: 3,
      paidOrders: 2,
      invalidPaidOrders: 0,
    });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]).toMatchObject({
      email: "cliente@example.com",
      firstName: "Ana Maria",
      productName: "Produto novo",
      sourceOrderId: "new-order",
      sourceReference: "MIL-2",
      address: {
        city: "Lisboa",
        postalCode: "1000-100",
      },
    });
    expect(result.customers[0].firstPurchaseAt.toISOString()).toBe(
      "2026-08-01T10:05:00.000Z",
    );
    expect(result.customers[0].lastPurchaseAt.toISOString()).toBe(
      "2026-08-10T10:01:00.000Z",
    );
  });

  it("ignora compras pagas sem identidade válida", () => {
    const result = normalizeMilluniCustomers({
      encomendas: [
        {
          id: "bad-email",
          estado: "pago",
          email: "email-invalido",
          createdAt: "2026-08-01T10:00:00.000Z",
        },
        {
          estado: "pago",
          email: "valid@example.com",
          createdAt: "data-invalida",
        },
      ],
    });

    expect(result.customers).toEqual([]);
    expect(result.invalidPaidOrders).toBe(2);
  });
});
