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
 * Formato confirmado na API pública do serviço:
 *   POST https://api.pushcut.io/v1/notifications/{nome}
 *   Headers: API-Key: <token> + Content-Type: application/json
 *   Corpo: { title, text }
 *
 * O "nome" é o da notificação criada dentro da app Pushcut — é ela que
 * define som, ícone e ações.
 *
 * Existem dois canais independentes (venda gerada e venda aprovada), cada
 * um com a sua própria chave de API e nome de notificação, para o alerta
 * de "pedido criado" poder ter som/ação diferente do de "pagamento
 * confirmado". Podem partilhar a mesma chave de conta — o que os separa na
 * app é o nome da notificação.
 */
const PUSHCUT_BASE = "https://api.pushcut.io/v1";
const INTEGRATION_KEY = "pushcut";

interface StoredSlotConfig {
  notificationName?: string;
  events?: string[];
}

interface StoredConfig {
  slots?: Partial<Record<PushcutSlotKey, StoredSlotConfig>>;
  /** Formato antigo: um único canal com nome e eventos no topo. */
  notificationName?: string;
  events?: string[];
}

/**
 * As chaves ficam num único campo cifrado, como JSON por canal.
 * Guardas de compatibilidade: a versão anterior gravava uma chave só, em
 * texto simples dentro do cifrado — nesse caso ela vale para os dois canais
 * até o utilizador guardar de novo.
 */
function parseStoredKeys(
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
      const keys: Partial<Record<PushcutSlotKey, string>> = {};
      for (const slot of PUSHCUT_SLOTS) {
        const value = parsed[slot.key];
        if (typeof value === "string" && value.trim()) keys[slot.key] = value;
      }
      return keys;
    }
  } catch {
    // Não é JSON — formato antigo, uma chave só.
  }

  return plain.trim()
    ? { sale_created: plain.trim(), sale_approved: plain.trim() }
    : {};
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
        },
      ]),
    ) as Record<PushcutSlotKey, PushcutSlotStatus>,
    lastEventAt: null,
    lastError: null,
  };
}

/** Estado atual da integração, para exibir no painel. */
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
    const keys = parseStoredKeys(row.encryptedCredentials);

    const slots = Object.fromEntries(
      PUSHCUT_SLOTS.map((slot) => {
        const stored = config.slots?.[slot.key];
        // Formato antigo: o canal de venda aprovada herda a configuração
        // única que existia antes de haver dois canais.
        const legacy =
          slot.key === "sale_approved" && !config.slots
            ? { notificationName: config.notificationName, events: config.events }
            : undefined;

        return [
          slot.key,
          {
            key: slot.key,
            configured: Boolean(keys[slot.key]),
            notificationName:
              stored?.notificationName ??
              legacy?.notificationName ??
              slot.defaultName,
            events: stored?.events ?? legacy?.events ?? slot.defaultEvents,
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
  /** Vazio mantém a chave já guardada para este canal. */
  apiKey: string;
  notificationName: string;
  events: string[];
}

/** Guarda as chaves (cifradas) e a configuração de cada canal. */
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

  // Campo em branco no formulário significa "não mexer na chave guardada",
  // para o utilizador poder editar o nome sem recolar a chave.
  const keys = parseStoredKeys(existing?.encryptedCredentials ?? null);
  const slotsConfig: Partial<Record<PushcutSlotKey, StoredSlotConfig>> = {};

  for (const input of inputs) {
    if (input.apiKey.trim()) keys[input.key] = input.apiKey.trim();
    slotsConfig[input.key] = {
      notificationName: input.notificationName,
      events: input.events,
    };
  }

  const values = {
    workspaceId,
    key: INTEGRATION_KEY,
    name: "Pushcut",
    category: "automation" as const,
    status: "connected" as const,
    encryptedCredentials: encryptSecret(JSON.stringify(keys)),
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

    const apiKey = parseStoredKeys(row.encryptedCredentials)[slotKey];
    if (!apiKey) {
      return { ok: false, error: "Este canal não tem chave de API guardada." };
    }

    const config = (row.config ?? {}) as StoredConfig;
    const slotDefaults = PUSHCUT_SLOTS.find((s) => s.key === slotKey);
    const name = (
      config.slots?.[slotKey]?.notificationName ??
      (slotKey === "sale_approved" && !config.slots
        ? config.notificationName
        : undefined) ??
      slotDefaults?.defaultName ??
      ""
    ).trim();

    if (!name) {
      return { ok: false, error: "Falta o nome da notificação do Pushcut." };
    }

    const response = await fetch(
      `${PUSHCUT_BASE}/notifications/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: {
          "API-Key": apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ title, text }),
      },
    );

    const now = new Date();

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error =
        response.status === 401 || response.status === 403
          ? "Chave de API do Pushcut inválida."
          : response.status === 404
            ? `Notificação "${name}" não existe na app Pushcut.`
            : `Erro HTTP ${response.status} do Pushcut. ${detail.slice(0, 200)}`;

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
      error instanceof Error ? error.message : "Falha ao contactar o Pushcut.";
    console.error("[pushcut] erro ao enviar:", error);
    return { ok: false, error: message };
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
