import { describe, expect, it } from "vitest";

import {
  readLandingPath,
  type SiteFile,
} from "@/features/landing-pages/deployment/vercel";

/**
 * O endereço que o painel guarda é o que o lojista copia para o anúncio.
 * Aterrar na raiz do projeto custa um salto de redirecionamento antes da
 * página, e há gestores de anúncios que recusam o destino por causa disso.
 */

/** Um vercel.json avulso, sem passar pelo disco. */
function configFile(value: unknown): SiteFile[] {
  return [
    {
      path: "vercel.json",
      data: Buffer.from(JSON.stringify(value), "utf8"),
      sha: "",
    },
  ];
}

describe("caminho da página no endereço publicado", () => {
  it("sai do destino que o vercel.json dá à raiz", () => {
    const files = configFile({
      redirects: [
        { source: "/", destination: "/lp/loja-teste", permanent: false },
      ],
    });
    expect(readLandingPath(files)).toBe("/lp/loja-teste");
  });

  it("fica vazio sem vercel.json ou sem redirecionamento da raiz", () => {
    expect(readLandingPath([])).toBe("");
    expect(readLandingPath(configFile({}))).toBe("");
    expect(
      readLandingPath(
        configFile({ redirects: [{ source: "/antiga", destination: "/nova" }] }),
      ),
    ).toBe("");
  });

  it("aguenta um vercel.json ilegível sem rebentar o deploy", () => {
    const broken: SiteFile[] = [
      { path: "vercel.json", data: Buffer.from("{", "utf8"), sha: "" },
    ];
    expect(readLandingPath(broken)).toBe("");
  });

  it("recusa destinos que não são um caminho colável", () => {
    for (const destination of [
      "https://outra-loja.example/lp",
      "//outra-loja.example/lp",
      "/lp/:slug",
      "/lp/(.*)",
      42,
    ]) {
      expect(
        readLandingPath(configFile({ redirects: [{ source: "/", destination }] })),
      ).toBe("");
    }
  });

  it("trata a raiz e a barra final como ausência de caminho", () => {
    expect(
      readLandingPath(configFile({ redirects: [{ source: "/", destination: "/" }] })),
    ).toBe("");
    expect(
      readLandingPath(
        configFile({ redirects: [{ source: "/", destination: "/lp/loja/" }] }),
      ),
    ).toBe("/lp/loja");
  });
});
