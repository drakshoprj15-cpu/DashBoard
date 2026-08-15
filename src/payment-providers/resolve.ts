import { and, desc, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { paymentProviderAccounts, paymentProviders } from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";
import { createBroskiProvider } from "@/payment-providers/broski";
import type { PaymentProvider } from "@/payment-providers/types";

/**
 * Resolve QUEM processa o pagamento de um workspace.
 *
 * Existe para que nenhuma rota, action ou componente precise conhecer o
 * gateway: quem cobra pede um `PaymentProvider` aqui e chama a interface.
 * Trocar o Broski por outro adapter amanhã é acrescentar um `case` neste
 * arquivo — o checkout da loja e os links de pagamento ficam intactos.
 *
 * Ordem de resolução:
 * 1. Conta de gateway ativa do workspace (`payment_provider_accounts`), com
 *    credenciais decifradas em runtime;
 * 2. Variáveis de ambiente da instalação (BROSKI_API_KEY/…).
 *
 * As credenciais nunca saem do servidor: este módulo só é importado por
 * server actions e route handlers, e o que devolve é o adapter — jamais as
 * chaves.
 */

export interface ResolvedProvider {
  provider: PaymentProvider;
  providerKey: string;
  /** Conta do workspace usada, quando a resolução não veio do ambiente */
  providerAccountId: string | null;
  environment: "sandbox" | "production";
}

export class PaymentProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "Nenhum processador de pagamentos está configurado para este workspace.",
    );
    this.name = "PaymentProviderNotConfiguredError";
  }
}

interface StoredCredentials {
  apiKey?: string;
  webhookSecret?: string;
}

/** Credenciais da conta do workspace, se houver uma ativa e legível. */
async function loadWorkspaceAccount(workspaceId: string): Promise<{
  accountId: string;
  providerKey: string;
  environment: "sandbox" | "production";
  credentials: StoredCredentials;
} | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    const db = getDb();
    const [row] = await db
      .select({
        accountId: paymentProviderAccounts.id,
        providerKey: paymentProviders.key,
        environment: paymentProviderAccounts.environment,
        encryptedCredentials: paymentProviderAccounts.encryptedCredentials,
      })
      .from(paymentProviderAccounts)
      .innerJoin(
        paymentProviders,
        eq(paymentProviders.id, paymentProviderAccounts.providerId),
      )
      .where(
        and(
          eq(paymentProviderAccounts.workspaceId, workspaceId),
          eq(paymentProviderAccounts.isActive, true),
        ),
      )
      .orderBy(desc(paymentProviderAccounts.isDefault))
      .limit(1);

    if (!row?.encryptedCredentials) return null;

    return {
      accountId: row.accountId,
      providerKey: row.providerKey,
      environment: row.environment,
      credentials: JSON.parse(
        decryptSecret(row.encryptedCredentials),
      ) as StoredCredentials,
    };
  } catch (error) {
    // Credencial ilegível (chave de criptografia trocada) não pode derrubar
    // o pagamento: cai para o ambiente e regista o problema no servidor.
    console.error(
      "[payment-providers] falha ao ler a conta do workspace:",
      error,
    );
    return null;
  }
}

function buildProvider(
  providerKey: string,
  credentials: StoredCredentials,
  environment: "sandbox" | "production",
): PaymentProvider | null {
  if (providerKey === "broski" && credentials.apiKey) {
    return createBroskiProvider({
      environment,
      apiKey: credentials.apiKey,
      webhookSecret: credentials.webhookSecret,
    });
  }
  return null;
}

/**
 * Provider de um workspace. Lança `PaymentProviderNotConfiguredError` quando
 * não há gateway utilizável — quem chama traduz isso numa mensagem humana,
 * nunca num stack trace para o comprador.
 */
export async function getWorkspacePaymentProvider(
  workspaceId: string,
): Promise<ResolvedProvider> {
  const account = await loadWorkspaceAccount(workspaceId);

  if (account) {
    const provider = buildProvider(
      account.providerKey,
      account.credentials,
      account.environment,
    );
    if (provider) {
      return {
        provider,
        providerKey: account.providerKey,
        providerAccountId: account.accountId,
        environment: account.environment,
      };
    }
  }

  const apiKey = process.env.BROSKI_API_KEY;
  if (!apiKey) throw new PaymentProviderNotConfiguredError();

  return {
    provider: createBroskiProvider({
      environment: "production",
      apiKey,
      webhookSecret: process.env.BROSKI_WEBHOOK_SECRET,
    }),
    providerKey: "broski",
    providerAccountId: null,
    environment: "production",
  };
}

/** Há algum processador utilizável? Usado para avisar antes de cobrar. */
export async function hasPaymentProvider(
  workspaceId: string,
): Promise<boolean> {
  if (process.env.BROSKI_API_KEY) return true;
  return (await loadWorkspaceAccount(workspaceId)) !== null;
}
