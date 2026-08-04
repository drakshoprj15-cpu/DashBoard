import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { integrations } from "@/database/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  PUSHCUT_SLOTS,
  type PushcutSlotKey,
  type PushcutSlotStatus,
  type PushcutStatus,
} from "@/features/notifications/pushcut-types";

// Reexportados para não quebrar quem já importa daqui — mas o conteúdo
// client-safe vive em `./pushcut-types` (sem tocar em `postgres`).
export {
  PUSHCUT_EVENTS,
  PUSHCUT_SLOTS,
  type PushcutSlotKey,
  type PushcutSlotStatus,
  type PushcutStatus,
} from "@/features/notifications/pushcut-types";

/**
 * Adapter do Pushcut — notificações push no iPhone/Apple Watch.
 *
 * O Pushcut NÃO usa uma API Key em header aqui. Cada Notification, dentro da
 * app, tem um "Webhook URL" próprio que já contém o segredo da conta:
 *
 *   https://api.pushcut.io/{secret}/notifications/{nome da notificação}
 *
 * Basta um POST (ou GET) nesse endereço, sem headers de autenticação — o
 * segredo já está embutido no caminho. É essa URL, colada inteira pelo
 * utilizador, que guardamos cifrada; nunca pedimos o "Account → API key"
 * (esse é para a API REST versionada, que este painel não usa).
 *
 * Existem dois canais independentes (venda gerada e venda aprovada), cada
 * um com o seu próprio webhook, para o alerta de "pedido criado" poder ter
 * som/ação diferente do de "pagamento confirmado".
 */
const PUSHCUT_HOSTNAME = "api.pushcut.io";
const PUSHCUT_PATH_RE = /^\/([^/]+)\/notifications\/([^/]+)$/;
const INTEGRATION_KEY = "pushcut";

interface StoredSlotConfig {
  /** Eventos atribuídos a este canal — não deriva da URL, é escolha do utilizador. */
  events?: string[];
}

interface StoredConfig {
  slots?: Partial<Record<PushcutSlotKey, StoredSlotConfig>>;
  /** Formato antigo: um único canal com nome e eventos no topo. */
  notificationName?: string;
  events?: string[];
}

export interface PushcutWebhookValidation {
  ok: boolean;
  error?: string;
  /** Só presente quando ok. URL normalizada, pronta para fetch. */
  normalizedUrl?: string;
  secret?: string;
  notificationName?: string;
  maskedUrl?: string;
  /** Aviso não bloqueante — a URL é válida e utilizável mesmo assim. */
  warning?: string;
}

/**
 * Valida uma URL de webhook do Pushcut colada pelo utilizador.
 *
 * Regra de ouro contra SSRF: nunca validar por `.includes(...)` — sempre via
 * `new URL(...)` e comparação exata de protocolo/hostname, para não deixar
 * passar domínios parecidos, subdomínios ou credenciais embutidas.
 */
export function validatePushcutWebhookUrl(
  value: string,
): PushcutWebhookValidation {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: "A URL do webhook está vazia." };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { ok: false, error: "Isto não é uma URL válida." };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      error: "A URL do webhook tem de começar por https://.",
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      ok: false,
      error: "A URL do webhook não pode conter utilizador/senha embutidos.",
    };
  }

  if (parsedUrl.hostname !== PUSHCUT_HOSTNAME) {
    return {
      ok: false,
      error: `A URL do webhook tem de apontar exatamente para ${PUSHCUT_HOSTNAME}.`,
    };
  }

  if (parsedUrl.port) {
    return {
      ok: false,
      error: "A URL do webhook não pode usar uma porta personalizada.",
    };
  }

  if (parsedUrl.search || parsedUrl.hash) {
    return {
      ok: false,
      error: "A URL do webhook não deve ter parâmetros extra (? ou #).",
    };
  }

  const match = parsedUrl.pathname.match(PUSHCUT_PATH_RE);
  if (!match) {
    return {
      ok: false,
      error:
        "Formato inválido. Esperado: https://api.pushcut.io/[secret]/notifications/[nome].",
    };
  }

  const [, secret, encodedName] = match;
  if (!secret) {
    return {
      ok: false,
      error: "A URL do webhook não contém o segredo da conta Pushcut.",
    };
  }

  let notificationName: string;
  try {
    notificationName = decodeURIComponent(encodedName);
  } catch {
    return {
      ok: false,
      error: "O nome da notificação na URL está mal formatado.",
    };
  }

  if (!notificationName.trim()) {
    return {
      ok: false,
      error: "A URL do webhook não contém o nome da notificação.",
    };
  }

  // Espaço sobrando no nome não invalida a URL — é o nome real cadastrado no
  // Pushcut (a própria app deixa criar assim). Bloquear aqui faria uma URL
  // que funcionaria de verdade parecer quebrada. Só avisamos, sem mexer no
  // valor: mandar exatamente o que veio da app é o único jeito de garantir
  // que bate com o nome que o Pushcut tem guardado do lado dele.
  const warning =
    notificationName !== notificationName.trim()
      ? `O nome da notificação tem um espaço no início ou no fim ("${notificationName}"). A URL funciona assim mesmo, mas se quiser deixar mais limpo, renomeie a notificação no app Pushcut (sem espaço nas pontas) e cole a URL de novo.`
      : undefined;

  return {
    ok: true,
    normalizedUrl: parsedUrl.toString(),
    secret,
    notificationName,
    maskedUrl: `https://${PUSHCUT_HOSTNAME}/••••••••/notifications/${encodedName}`,
    warning,
  };
}

/** Nunca escreve a URL/segredo em texto — só uma versão redigida, para logs. */
function redactForLog(text: string): string {
  return text.replace(
    new RegExp(`${PUSHCUT_HOSTNAME}/[^/\\s]+`, "gi"),
    `${PUSHCUT_HOSTNAME}/[REDACTED]`,
  );
}

/**
 * As URLs ficam num único campo cifrado, como JSON por canal.
 * Guarda de compatibilidade: a versão anterior gravava aqui uma "chave de
 * API" (não uma URL) — esse valor não passa em `validatePushcutWebhookUrl`,
 * então o canal volta a aparecer como "não configurado" até o utilizador
 * colar a URL correta.
 */
function parseStoredWebhooks(
  encrypted: string | null,
): Partial<Record<PushcutSlotKey, string>> {
  if (!encrypted) return {};

  let plain: string;
  try {
    plain = decryptSecret(encrypted);
  } catch (error) {
    console.error("[pushcut] credencial ilegível:", error);
    return {};
  }

  try {
    const parsed = JSON.parse(plain) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const urls: Partial<Record<PushcutSlotKey, string>> = {};
      for (const slot of PUSHCUT_SLOTS) {
        const value = parsed[slot.key];
        if (typeof value === "string" && value.trim()) urls[slot.key] = value;
      }
      return urls;
    }
  } catch {
    // Não é JSON — não reconhecemos o formato, trata como vazio.
  }

  return {};
}

function emptyStatus(): PushcutStatus {
  return {
    configured: false,
    isActive: false,
    slots: Object.fromEntries(
      PUSHCUT_SLOTS.map((s) => [
        s.key,
        {
          key: s.key,
          configured: false,
          notificationName: s.defaultName,
          events: s.defaultEvents,
          maskedUrl: null,
        },
      ]),
    ) as Record<PushcutSlotKey, PushcutSlotStatus>,
    lastEventAt: null,
    lastError: null,
  };
}

/** Estado atual da integração, para exibir no painel. Nunca devolve a URL completa. */
export async function getPushcutStatus(): Promise<PushcutStatus> {
  if (!isDatabaseConfigured()) return emptyStatus();

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const [row] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          eq(integrations.key, INTEGRATION_KEY),
        ),
      )
      .limit(1);

    if (!row) return emptyStatus();

    const config = (row.config ?? {}) as StoredConfig;
    const urls = parseStoredWebhooks(row.encryptedCredentials);

    const slots = Object.fromEntries(
      PUSHCUT_SLOTS.map((slot) => {
        const raw = urls[slot.key];
        const validation = raw ? validatePushcutWebhookUrl(raw) : null;

        const stored = config.slots?.[slot.key];
        // Formato antigo: o canal de venda aprovada herda os eventos únicos
        // que existiam antes de haver dois canais.
        const legacyEvents =
          slot.key === "sale_approved" && !config.slots
            ? config.events
            : undefined;

        return [
          slot.key,
          {
            key: slot.key,
            configured: Boolean(validation?.ok),
            notificationName: validation?.ok
              ? validation.notificationName!
              : slot.defaultName,
            events: stored?.events ?? legacyEvents ?? slot.defaultEvents,
            maskedUrl: validation?.ok ? validation.maskedUrl! : null,
          },
        ];
      }),
    ) as Record<PushcutSlotKey, PushcutSlotStatus>;

    return {
      configured: Object.values(slots).some((s) => s.configured),
      isActive: row.status === "connected",
      slots,
      lastEventAt: row.lastEventAt,
      lastError: row.lastError,
    };
  } catch (error) {
    console.error("[pushcut] erro ao ler estado:", error);
    return emptyStatus();
  }
}

export interface PushcutSlotInput {
  key: PushcutSlotKey;
  /** Vazio mantém a URL já guardada para este canal. */
  webhookUrl: string;
  events: string[];
}

/** Guarda os webhooks (cifrados) e a configuração de cada canal. */
export async function savePushcutCredentials(
  inputs: PushcutSlotInput[],
): Promise<void> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [existing] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.key, INTEGRATION_KEY),
      ),
    )
    .limit(1);

  // Campo em branco no formulário significa "não mexer na URL guardada".
  const urls = parseStoredWebhooks(existing?.encryptedCredentials ?? null);
  const slotsConfig: Partial<Record<PushcutSlotKey, StoredSlotConfig>> = {};

  for (const input of inputs) {
    if (input.webhookUrl.trim()) {
      const validation = validatePushcutWebhookUrl(input.webhookUrl);
      if (!validation.ok) {
        throw new Error(validation.error ?? "URL de webhook inválida.");
      }
      urls[input.key] = validation.normalizedUrl!;
    }
    slotsConfig[input.key] = { events: input.events };
  }

  const values = {
    workspaceId,
    key: INTEGRATION_KEY,
    name: "Pushcut",
    category: "automation" as const,
    status: "connected" as const,
    encryptedCredentials: encryptSecret(JSON.stringify(urls)),
    config: { slots: slotsConfig },
    lastError: null,
  };

  await db
    .insert(integrations)
    .values(values)
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.key],
      set: {
        encryptedCredentials: values.encryptedCredentials,
        config: values.config,
        status: values.status,
        lastError: null,
        updatedAt: new Date(),
      },
    });
}

export async function setPushcutActive(active: boolean): Promise<void> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(integrations)
    .set({
      status: active ? "connected" : "disabled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.key, INTEGRATION_KEY),
      ),
    );
}

export interface PushcutSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Envia um push por um canal específico. Nunca lança: é chamado a partir do
 * webhook do gateway e do checkout, onde uma falha de push não pode afetar
 * o processamento do pagamento.
 */
export async function sendPushcutNotification(
  slotKey: PushcutSlotKey,
  title: string,
  text: string,
  options: { force?: boolean } = {},
): Promise<PushcutSendResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const [row] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          eq(integrations.key, INTEGRATION_KEY),
        ),
      )
      .limit(1);

    if (!row) return { ok: false, error: "Pushcut não configurado." };

    // `force` permite o botão "Enviar teste" mesmo com a integração pausada.
    if (row.status !== "connected" && !options.force) {
      return { ok: false, error: "Integração desativada." };
    }

    const rawUrl = parseStoredWebhooks(row.encryptedCredentials)[slotKey];
    if (!rawUrl) {
      return { ok: false, error: "Este canal não tem webhook guardado." };
    }

    // Revalida depois de descriptografar — a URL nunca é usada "às cegas".
    const validation = validatePushcutWebhookUrl(rawUrl);
    if (!validation.ok) {
      return {
        ok: false,
        error:
          "O webhook guardado para este canal está inválido. Recole a URL.",
      };
    }

    const now = new Date();

    let response: Response;
    try {
      response = await fetch(validation.normalizedUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ title, text }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (fetchError) {
      const isAbort =
        fetchError instanceof Error && fetchError.name === "TimeoutError";
      const error = isAbort
        ? "O Pushcut demorou demais para responder."
        : "Não foi possível contactar o Pushcut (ligação recusada ou redirecionada).";

      await db
        .update(integrations)
        .set({ lastError: error, updatedAt: now })
        .where(eq(integrations.id, row.id));

      return { ok: false, error };
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const looksLikeNotificationIssue = /notification/i.test(detail);

      const error =
        response.status === 400
          ? "O Pushcut recusou os dados enviados."
          : response.status === 401 || response.status === 403
            ? "O webhook informado é inválido ou foi revogado."
            : response.status === 404 && looksLikeNotificationIssue
              ? `A notificação "${validation.notificationName}" não foi encontrada. Verifique o nome no aplicativo Pushcut.`
              : response.status === 404
                ? "O webhook informado é inválido ou foi revogado."
                : `Erro HTTP ${response.status} do Pushcut.`;

      await db
        .update(integrations)
        .set({ lastError: error, updatedAt: now })
        .where(eq(integrations.id, row.id));

      return { ok: false, error };
    }

    await db
      .update(integrations)
      .set({ lastEventAt: now, lastError: null, updatedAt: now })
      .where(eq(integrations.id, row.id));

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? redactForLog(error.message)
        : "Falha ao contactar o Pushcut.";
    console.error("[pushcut] erro ao enviar:", message);
    return {
      ok: false,
      error: "Não foi possível enviar a notificação de teste.",
    };
  }
}

/**
 * Envia o push do evento pelo canal que o utilizador atribuiu a ele.
 * Sem canal configurado para o evento, não faz nada (não é erro).
 */
export async function pushEvent(
  eventType: string,
  title: string,
  text: string,
): Promise<void> {
  const status = await getPushcutStatus();
  if (!status.configured || !status.isActive) return;

  for (const slot of Object.values(status.slots)) {
    if (!slot.configured || !slot.events.includes(eventType)) continue;
    await sendPushcutNotification(slot.key, title, text);
  }
}
