import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSession } from "@/lib/auth/session";

/**
 * Cenário do furo original: sem Supabase configurado, o painel abria em modo
 * demonstração — ou seja, sem pedir senha a ninguém.
 */
const SUPABASE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of SUPABASE_ENV) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of SUPABASE_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  delete process.env.ALLOW_DEMO_MODE;
  vi.restoreAllMocks();
});

describe("getSession sem Supabase configurado", () => {
  it("não devolve sessão — o painel exige login em vez de abrir sozinho", async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it("só abre em modo demonstração quando explicitamente habilitado", async () => {
    process.env.ALLOW_DEMO_MODE = "true";

    const session = await getSession();

    expect(session?.demoMode).toBe(true);
  });
});
