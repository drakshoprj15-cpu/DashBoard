import { afterEach, describe, expect, it } from "vitest";

import {
  getOwnerEmails,
  isOwnerAllowlistEnabled,
  isOwnerEmail,
} from "@/lib/auth/owner";
import { isDemoModeAllowed } from "@/lib/supabase/config";

afterEach(() => {
  delete process.env.OWNER_EMAILS;
  delete process.env.ALLOW_DEMO_MODE;
});

describe("getOwnerEmails", () => {
  it("separa por vírgula, normaliza e descarta vazios", () => {
    process.env.OWNER_EMAILS = " Dono@Exemplo.com , , outro@exemplo.com ";
    expect(getOwnerEmails()).toEqual(["dono@exemplo.com", "outro@exemplo.com"]);
  });

  it("devolve lista vazia quando a env não existe", () => {
    expect(getOwnerEmails()).toEqual([]);
    expect(isOwnerAllowlistEnabled()).toBe(false);
  });
});

describe("isOwnerEmail", () => {
  it("aceita o dono ignorando maiúsculas e espaços", () => {
    process.env.OWNER_EMAILS = "dono@exemplo.com";
    expect(isOwnerEmail(" DONO@Exemplo.com ")).toBe(true);
  });

  it("recusa qualquer outra conta, mesmo válida no Supabase", () => {
    process.env.OWNER_EMAILS = "dono@exemplo.com";
    expect(isOwnerEmail("cliente@exemplo.com")).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("sem allowlist configurada não bloqueia ninguém", () => {
    expect(isOwnerEmail("qualquer@exemplo.com")).toBe(true);
  });
});

describe("isDemoModeAllowed", () => {
  it("fica desligado por padrão — o painel nunca abre sem login", () => {
    expect(isDemoModeAllowed()).toBe(false);
  });

  it("só liga com o valor exato true", () => {
    process.env.ALLOW_DEMO_MODE = "1";
    expect(isDemoModeAllowed()).toBe(false);

    process.env.ALLOW_DEMO_MODE = "true";
    expect(isDemoModeAllowed()).toBe(true);
  });
});
