import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppUrl } from "@/lib/app-url";
import { enforceHttps, isLocalHostname, toSecureUrl } from "@/lib/secure-url";

describe("toSecureUrl", () => {
  it("keeps an https address exactly as written", () => {
    expect(toSecureUrl("https://loja.pt/pagar/abc?utm=1#topo")).toBe(
      "https://loja.pt/pagar/abc?utm=1#topo",
    );
  });

  it("upgrades http and protocol-less addresses to https", () => {
    expect(toSecureUrl("http://loja.pt/pagar/abc")).toBe(
      "https://loja.pt/pagar/abc",
    );
    expect(toSecureUrl("HTTP://Loja.pt/pagar")).toBe("https://loja.pt/pagar");
    expect(toSecureUrl("//loja.pt/pagar")).toBe("https://loja.pt/pagar");
    expect(toSecureUrl("loja.pt/pagar/abc")).toBe("https://loja.pt/pagar/abc");
  });

  it("refuses anything that is not a plain web address", () => {
    expect(toSecureUrl("")).toBeNull();
    expect(toSecureUrl("javascript:alert(1)")).toBeNull();
    expect(toSecureUrl("data:text/html,x")).toBeNull();
    expect(toSecureUrl("mailto:a@b.pt")).toBeNull();
    expect(toSecureUrl("ftp://loja.pt/x")).toBeNull();
    expect(toSecureUrl("https://loja.pt/com espaco")).toBeNull();
    expect(toSecureUrl("checkout")).toBeNull();
    expect(toSecureUrl("https://banco.pt@outro.site/pagar")).toBeNull();
  });

  it("leaves local development addresses on http", () => {
    expect(toSecureUrl("http://localhost:3000/checkout/x")).toBe(
      "http://localhost:3000/checkout/x",
    );
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("192.168.1.20")).toBe(true);
    expect(isLocalHostname("172.32.0.1")).toBe(false);
    expect(isLocalHostname("loja.pt")).toBe(false);
  });

  it("enforceHttps falls back to the original value when it cannot parse", () => {
    expect(enforceHttps("http://painel.exemplo.pt")).toBe(
      "https://painel.exemplo.pt/",
    );
    expect(enforceHttps("nao e url")).toBe("nao e url");
  });
});

describe("getAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never returns an http address for a public domain", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://painel.exemplo.pt/");
    expect(getAppUrl()).toBe("https://painel.exemplo.pt");
  });

  it("keeps https and localhost values untouched", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://painel.exemplo.pt");
    expect(getAppUrl()).toBe("https://painel.exemplo.pt");

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});
