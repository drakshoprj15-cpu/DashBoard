import "server-only";

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, posix, relative, resolve, sep } from "node:path";

/**
 * Envio de um site estático para a Vercel.
 *
 * Existe para as landing pages que não nascem do editor visual — um site já
 * exportado, por exemplo — e que por isso precisam de um projeto próprio em
 * vez da rota `/lp/[slug]` desta aplicação.
 *
 * `server-only` no topo não é decoração: o token da Vercel dá acesso de
 * escrita à conta inteira, e a importação acidental deste módulo a partir de
 * um componente de cliente passa a ser um erro de compilação, não um segredo
 * publicado no pacote do navegador.
 */

const API = "https://api.vercel.com";

export interface VercelDeployResult {
  ok: boolean;
  deploymentId?: string;
  projectId?: string;
  /** Endereço estável do projeto (`<projeto>.vercel.app`) */
  url?: string;
  /** Endereço deste envio em concreto, útil para comparar versões */
  deploymentUrl?: string;
  inspectorUrl?: string;
  error?: string;
  log: string;
}

export function isVercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN);
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` };
}

function withTeam(path: string): string {
  const team = process.env.VERCEL_TEAM_ID;
  if (!team) return `${API}${path}`;
  const separator = path.includes("?") ? "&" : "?";
  return `${API}${path}${separator}teamId=${encodeURIComponent(team)}`;
}

// ---------------------------------------------------------------------------
// Leitura da pasta do site
// ---------------------------------------------------------------------------

/** Só nomes de pasta previsíveis — o valor vem do banco e nunca do caminho. */
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SiteFile {
  /** Caminho relativo à raiz do site, sempre com barras normais */
  path: string;
  data: Buffer;
  sha: string;
}

/**
 * Lê a pasta publicável de um site estático versionado no repositório.
 *
 * O caminho é montado a partir do slug e depois conferido contra a raiz: um
 * slug adulterado no banco não consegue apontar para fora de `landing-sites`,
 * porque o resultado resolvido tem de continuar por baixo dela.
 */
export async function readSiteFiles(slug: string): Promise<SiteFile[]> {
  if (!SAFE_SLUG.test(slug)) {
    throw new Error(`Slug inválido para hospedagem estática: "${slug}"`);
  }

  const root = resolve(process.cwd(), "landing-sites");
  const siteRoot = resolve(root, slug, "public");
  if (siteRoot !== root && !siteRoot.startsWith(root + sep)) {
    throw new Error("Caminho do site fora da pasta permitida.");
  }

  const info = await stat(siteRoot).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(
      `Não encontrei os ficheiros do site em landing-sites/${slug}/public.`,
    );
  }

  const files: SiteFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const data = await readFile(full);
      files.push({
        path: relative(siteRoot, full).split(sep).join(posix.sep),
        data,
        sha: createHash("sha1").update(data).digest("hex"),
      });
    }
  }

  await walk(siteRoot);

  if (files.length === 0) {
    throw new Error(`A pasta landing-sites/${slug}/public está vazia.`);
  }
  return files;
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

/** Sobe um ficheiro; a Vercel devolve 200 também quando já o tinha. */
async function uploadFile(file: SiteFile): Promise<void> {
  const response = await fetch(`${API}/v2/files`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.data.byteLength),
      "x-vercel-digest": file.sha,
    },
    body: new Uint8Array(file.data),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Falha ao enviar ${file.path} (HTTP ${response.status}): ${detail.slice(0, 300)}`,
    );
  }
}

interface DeploymentPayload {
  id: string;
  url: string;
  readyState?: string;
  status?: string;
  alias?: string[];
  projectId?: string;
  inspectorUrl?: string;
  errorMessage?: string;
  error?: { message?: string };
}

async function getDeployment(id: string): Promise<DeploymentPayload> {
  const response = await fetch(withTeam(`/v13/deployments/${id}`), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Não consegui ler o estado do deploy (HTTP ${response.status}).`);
  }
  return (await response.json()) as DeploymentPayload;
}

const TERMINAL_OK = new Set(["READY"]);
const TERMINAL_FAIL = new Set(["ERROR", "CANCELED", "DELETED"]);

/**
 * Publica a pasta do site e espera pelo resultado.
 *
 * A espera é ativa e limitada: um site estático fica pronto em segundos, e
 * ficar pendurado num pedido do painel à espera indefinida seria pior do que
 * devolver "ainda a construir" e deixar o utilizador reabrir.
 */
export async function deployStaticSite(options: {
  projectName: string;
  slug: string;
  /** Máximo de segundos à espera do resultado */
  timeoutSeconds?: number;
}): Promise<VercelDeployResult> {
  const log: string[] = [];
  const note = (line: string) =>
    log.push(`${new Date().toISOString()} ${line}`);

  if (!isVercelConfigured()) {
    return {
      ok: false,
      error:
        "VERCEL_TOKEN não está configurado no servidor. Defina-o nas variáveis de ambiente para publicar a partir do painel.",
      log: "",
    };
  }

  try {
    note(`a ler landing-sites/${options.slug}/public`);
    const files = await readSiteFiles(options.slug);
    const bytes = files.reduce((total, file) => total + file.data.byteLength, 0);
    note(`${files.length} ficheiros, ${(bytes / 1024).toFixed(0)} KB`);

    // Envio sequencial de propósito: são poucas dezenas de ficheiros e um
    // pico de pedidos em paralelo é a forma mais fácil de apanhar limite de
    // taxa da API a meio de uma publicação.
    for (const file of files) {
      await uploadFile(file);
    }
    note("ficheiros enviados");

    const created = await fetch(withTeam("/v13/deployments"), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: options.projectName,
        target: "production",
        files: files.map((file) => ({
          file: file.path,
          sha: file.sha,
          size: file.data.byteLength,
        })),
        projectSettings: {
          framework: null,
          buildCommand: null,
          installCommand: null,
          outputDirectory: null,
        },
      }),
    });

    const payload = (await created.json()) as DeploymentPayload;

    if (!created.ok) {
      const message =
        payload.error?.message ?? `HTTP ${created.status} ao criar o deploy.`;
      note(`erro: ${message}`);
      return { ok: false, error: message, log: log.join("\n") };
    }

    note(`deploy ${payload.id} criado`);

    const deadline = Date.now() + (options.timeoutSeconds ?? 90) * 1000;
    let current = payload;

    while (Date.now() < deadline) {
      const state = current.readyState ?? current.status ?? "";
      if (TERMINAL_OK.has(state)) break;
      if (TERMINAL_FAIL.has(state)) {
        const message = current.errorMessage ?? `Deploy terminou em ${state}.`;
        note(`erro: ${message}`);
        return {
          ok: false,
          error: message,
          deploymentId: current.id,
          log: log.join("\n"),
        };
      }
      await new Promise((done) => setTimeout(done, 2000));
      current = await getDeployment(payload.id);
      note(`estado: ${current.readyState ?? current.status}`);
    }

    const finalState = current.readyState ?? current.status ?? "";
    if (!TERMINAL_OK.has(finalState)) {
      return {
        ok: false,
        error:
          "O deploy ainda está a construir. Confira em alguns instantes no botão “Ver deploy”.",
        deploymentId: current.id,
        log: log.join("\n"),
      };
    }

    // Entre os aliases devolvidos, o endereço estável do projeto é o mais
    // curto: é esse que vai para o anúncio, não o do envio concreto.
    const stable =
      (current.alias ?? [])
        .slice()
        .sort((a, b) => a.length - b.length)
        .find((alias) => alias.endsWith(".vercel.app")) ?? current.url;

    note(`pronto em ${stable}`);

    return {
      ok: true,
      deploymentId: current.id,
      projectId: current.projectId,
      url: `https://${stable}`,
      deploymentUrl: `https://${current.url}`,
      inspectorUrl: current.inspectorUrl,
      log: log.join("\n"),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido no deploy.";
    note(`erro: ${message}`);
    return { ok: false, error: message, log: log.join("\n") };
  }
}
