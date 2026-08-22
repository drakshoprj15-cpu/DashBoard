import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  applyLandingSiteOverrides,
  readBuildSettings,
  readSiteFiles,
} from "@/features/landing-pages/deployment/vercel";

/**
 * O envio para a Vercel é a única coisa entre o repositório e o que o cliente
 * vê no anúncio. Estes testes fixam as duas regras que já falharam em
 * produção: a pasta que sobe e de onde saem as definições de build.
 */

const cwd = process.cwd();
let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "landing-sites-"));
  const site = join(workdir, "landing-sites", "loja-teste");
  mkdirSync(join(site, "source"), { recursive: true });
  mkdirSync(join(site, "public", "css"), { recursive: true });
  mkdirSync(join(site, ".vercel"), { recursive: true });
  mkdirSync(join(site, "node_modules", "coisa"), { recursive: true });

  writeFileSync(join(site, "build.mjs"), "// gera public/lp\n");
  writeFileSync(join(site, "site.config.json"), '{"slug":"loja-teste"}');
  writeFileSync(
    join(site, "vercel.json"),
    JSON.stringify({
      framework: null,
      buildCommand: "node build.mjs",
      outputDirectory: "public",
      installCommand: null,
    }),
  );
  writeFileSync(join(site, "source", "index.html"), "<html></html>");
  writeFileSync(join(site, "public", "css", "site.css"), "body{}");
  writeFileSync(join(site, ".vercel", "project.json"), "{}");
  writeFileSync(join(site, "node_modules", "coisa", "index.js"), "");

  vi.spyOn(process, "cwd").mockReturnValue(workdir);
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(workdir, { recursive: true, force: true });
  expect(process.cwd()).toBe(cwd);
});

describe("ficheiros que sobem para a Vercel", () => {
  it("leva a pasta do site inteira, e não só o que já está construído", async () => {
    const paths = (await readSiteFiles("loja-teste")).map((file) => file.path);

    // Sem estes três o deploy corre `node build.mjs` sem ter o script, que é
    // exatamente como a primeira republicação a partir do painel falhou.
    expect(paths).toContain("build.mjs");
    expect(paths).toContain("site.config.json");
    expect(paths).toContain("source/index.html");
    expect(paths).toContain("vercel.json");
    expect(paths).toContain("public/css/site.css");
  });

  it("deixa de fora o estado local da CLI e as dependências", async () => {
    const paths = (await readSiteFiles("loja-teste")).map((file) => file.path);
    expect(paths.some((path) => path.startsWith(".vercel/"))).toBe(false);
    expect(paths.some((path) => path.startsWith("node_modules/"))).toBe(false);
  });

  it("recusa um slug que tente sair da pasta", async () => {
    await expect(readSiteFiles("../../etc")).rejects.toThrow(/Slug inválido/);
  });
});

describe("definições de build do envio", () => {
  it("saem do vercel.json do próprio site", async () => {
    const settings = readBuildSettings(await readSiteFiles("loja-teste"));
    expect(settings).toEqual({
      framework: null,
      buildCommand: "node build.mjs",
      installCommand: null,
      outputDirectory: "public",
    });
  });

  it("sem vercel.json, o conteúdo vai como está", () => {
    expect(readBuildSettings([])).toEqual({
      framework: null,
      buildCommand: null,
      installCommand: null,
      outputDirectory: null,
    });
  });
});

describe("identidade aplicada ao site externo", () => {
  it("injeta logo e favicon no site.config.json e atualiza o hash", async () => {
    const files = await readSiteFiles("loja-teste");
    const before = files.find((file) => file.path === "site.config.json");
    const updated = applyLandingSiteOverrides(files, {
      logoUrl: "https://cdn.exemplo.com/logo.png",
      logoAlt: "DK",
      faviconUrl: "https://cdn.exemplo.com/favicon.png",
    });
    const after = updated.find((file) => file.path === "site.config.json");

    expect(after?.sha).not.toBe(before?.sha);
    expect(JSON.parse(after!.data.toString("utf8"))).toMatchObject({
      brand: {
        logoUrl: "https://cdn.exemplo.com/logo.png",
        logoAlt: "DK",
      },
      faviconUrl: "https://cdn.exemplo.com/favicon.png",
    });
  });

  it("falha claramente quando o site não possui configuração", () => {
    expect(() =>
      applyLandingSiteOverrides([], {
        logoUrl: null,
        logoAlt: "DK",
        faviconUrl: null,
      }),
    ).toThrow(/site\.config\.json/);
  });
});
