"use server";

import { createBroskiProvider } from "@/payment-providers/broski";
import type { ConnectionTestResult } from "@/payment-providers/types";

/** Testa a conexão real com a API Broski usando as credenciais do ambiente. */
export async function testBroskiConnectionAction(): Promise<ConnectionTestResult> {
  if (!process.env.BROSKI_API_KEY) {
    return {
      ok: false,
      environment: "production",
      message: "BROSKI_API_KEY não configurada.",
    };
  }

  const provider = createBroskiProvider({
    environment: "production",
    apiKey: process.env.BROSKI_API_KEY,
    webhookSecret: process.env.BROSKI_WEBHOOK_SECRET,
  });

  return provider.testConnection();
}
