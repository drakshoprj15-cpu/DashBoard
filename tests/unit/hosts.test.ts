import { afterEach, describe, expect, it } from "vitest";

import { isPanelHost, isStorePath, normalizeHost } from "@/lib/hosts";

const PANEL = "painelinfinitydash.online";
const LOJA = "pcdignetstore.online";

afterEach(() => {
  delete process.env.PANEL_HOST;
});

describe("normalizeHost", () => {
  it("remove porta, www e maiúsculas", () => {
    expect(normalizeHost("WWW.PCDignetstore.Online:443")).toBe(LOJA);
    expect(normalizeHost("localhost:3000")).toBe("localhost");
  });

  it("aceita ausência de host", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("isPanelHost", () => {
  it("trata tudo como painel enquanto a env não estiver configurada", () => {
    // Instalação sem PANEL_HOST não pode perder acesso ao painel.
    expect(isPanelHost(LOJA)).toBe(true);
    expect(isPanelHost(PANEL)).toBe(true);
  });

  it("separa painel de loja com a env configurada", () => {
    process.env.PANEL_HOST = PANEL;
    expect(isPanelHost(PANEL)).toBe(true);
    expect(isPanelHost(`www.${PANEL}`)).toBe(true);
    expect(isPanelHost(LOJA)).toBe(false);
    expect(isPanelHost(`www.${LOJA}`)).toBe(false);
  });

  it("mantém desenvolvimento e domínios da Vercel no painel", () => {
    process.env.PANEL_HOST = PANEL;
    expect(isPanelHost("localhost:3000")).toBe(true);
    expect(isPanelHost("127.0.0.1")).toBe(true);
    expect(isPanelHost("dash-board-psi-one.vercel.app")).toBe(true);
  });

  it("sem host, assume painel", () => {
    process.env.PANEL_HOST = PANEL;
    expect(isPanelHost("")).toBe(true);
  });
});

describe("isStorePath", () => {
  it("libera a raiz e as rotas públicas da loja", () => {
    expect(isStorePath("/")).toBe(true);
    expect(isStorePath("/p/cadeira-gaming-alpha-gamer-nebula")).toBe(true);
    expect(isStorePath("/checkout/cadeira-gaming-alpha-gamer-nebula")).toBe(true);
    expect(isStorePath("/legal/termos")).toBe(true);
    expect(isStorePath("/loja")).toBe(true);
    expect(isStorePath("/api/public/track")).toBe(true);
    expect(isStorePath("/api/webhooks/broski")).toBe(true);
  });

  it("bloqueia o painel no domínio da loja", () => {
    expect(isStorePath("/dashboard")).toBe(false);
    expect(isStorePath("/login")).toBe(false);
    expect(isStorePath("/landing-pages/dominios")).toBe(false);
    expect(isStorePath("/api/dashboard")).toBe(false);
  });
});
