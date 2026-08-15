import type { PaymentMethod } from "@/payment-providers/types";

/**
 * Catálogo dos gateways suportados pela plataforma.
 * Somente métodos REALMENTE documentados por cada provedor — nunca inventados.
 * Usado pela página Processador (Fase 4) e pelo seed do banco.
 */
export interface ProviderCatalogEntry {
  key: string;
  name: string;
  description: string;
  supportedMethods: PaymentMethod[];
  supportedCurrencies: string[];
  countries: string[];
  /** true = adapter implementado no código */
  adapterReady: boolean;
  envVars: string[];
  docsUrl: string;
}

export const providerCatalog: ProviderCatalogEntry[] = [
  {
    key: "broski",
    name: "Broski",
    description:
      "Gateway português de MB WAY e Multibanco (EUR). Escolhido como gateway principal do usuário.",
    // Conforme https://docs.broski.pt/openapi.yaml — apenas estes dois métodos
    supportedMethods: ["mbway", "multibanco"],
    supportedCurrencies: ["EUR"],
    countries: ["PT"],
    adapterReady: true,
    envVars: ["BROSKI_API_KEY", "BROSKI_WEBHOOK_SECRET"],
    docsUrl: "https://docs.broski.pt",
  },
];
