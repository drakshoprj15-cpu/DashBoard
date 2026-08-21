import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_STATUS_LABEL,
  HOSTING_PROVIDER_LABEL,
  asDeploymentStatus,
  asHostingProvider,
  type LandingDeployment,
} from "@/features/landing-pages/types";

/**
 * Os dois campos de hospedagem são texto livre no banco, e o que a interface
 * faz com eles decide o endereço que o lojista copia para o anúncio. Um valor
 * inesperado não pode virar `undefined` a atravessar a página.
 */
describe("normalização dos campos de hospedagem", () => {
  it("aceita os valores conhecidos", () => {
    expect(asHostingProvider("vercel")).toBe("vercel");
    expect(asHostingProvider("infinity")).toBe("infinity");
    expect(asDeploymentStatus("ready")).toBe("ready");
    expect(asDeploymentStatus("failed")).toBe("failed");
    expect(asDeploymentStatus("deploying")).toBe("deploying");
  });

  it("cai no padrão seguro perante lixo", () => {
    for (const value of [null, undefined, "", "netlify", 42, {}]) {
      expect(asHostingProvider(value)).toBe("infinity");
    }
    for (const value of [null, undefined, "", "READY", "concluído", 7]) {
      expect(asDeploymentStatus(value)).toBe("idle");
    }
  });

  it("tem rótulo para todos os estados possíveis", () => {
    expect(Object.keys(DEPLOYMENT_STATUS_LABEL)).toEqual([
      "idle",
      "preparing",
      "deploying",
      "ready",
      "failed",
    ]);
    expect(HOSTING_PROVIDER_LABEL.vercel).toBe("Vercel");
    expect(HOSTING_PROVIDER_LABEL.infinity).toBe("Infinity");
  });
});

/**
 * A mesma regra é usada nos cartões, na tabela e no botão de copiar. Está
 * aqui em forma pura para não depender de renderizar a listagem inteira.
 */
function publicUrlOf(
  page: { slug: string; deployment: LandingDeployment },
  appUrl: string,
): string {
  return page.deployment.provider === "vercel" && page.deployment.url
    ? page.deployment.url
    : `${appUrl}/lp/${page.slug}`;
}

const baseDeployment: LandingDeployment = {
  provider: "infinity",
  status: "idle",
  url: null,
  projectId: null,
  deploymentId: null,
  log: null,
  updatedAt: null,
};

describe("endereço público segundo a hospedagem", () => {
  const appUrl = "https://www.painelinfinitydash.online";

  it("usa a rota do painel para as páginas do editor", () => {
    const url = publicUrlOf({ slug: "cadeira", deployment: baseDeployment }, appUrl);
    expect(url).toBe("https://www.painelinfinitydash.online/lp/cadeira");
  });

  it("usa o endereço do serviço quando a página é hospedada fora", () => {
    const url = publicUrlOf(
      {
        slug: "samsung-galaxy-a55-5g",
        deployment: {
          ...baseDeployment,
          provider: "vercel",
          status: "ready",
          url: "https://exemplo.vercel.app/lp/samsung-galaxy-a55-5g",
        },
      },
      appUrl,
    );
    expect(url).toBe("https://exemplo.vercel.app/lp/samsung-galaxy-a55-5g");
  });

  it("não inventa endereço enquanto o primeiro deploy não acontecer", () => {
    // Página marcada como externa mas ainda sem deploy: apontar para
    // `/lp/<slug>` do painel é errado, mas é o único endereço que existe — o
    // que não pode acontecer é a interface mostrar "null" ou um link vazio.
    const url = publicUrlOf(
      {
        slug: "nova",
        deployment: { ...baseDeployment, provider: "vercel", status: "idle" },
      },
      appUrl,
    );
    expect(url).toBe("https://www.painelinfinitydash.online/lp/nova");
  });
});
