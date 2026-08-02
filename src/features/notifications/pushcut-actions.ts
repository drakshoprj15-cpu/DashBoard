"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isDatabaseConfigured } from "@/database/client";
import {
  getPushcutStatus,
  PUSHCUT_SLOTS,
  savePushcutCredentials,
  sendPushcutNotification,
  setPushcutActive,
  validatePushcutWebhookUrl,
  type PushcutSlotInput,
  type PushcutSlotKey,
} from "@/features/notifications/pushcut";

const slotKeyEnum = z.enum(["sale_created", "sale_approved"]);

const slotSchema = z.object({
  key: slotKeyEnum,
  /** Vazio = manter a URL já guardada. */
  webhookUrl: z.string().trim(),
  events: z.array(z.string()),
});

export interface PushcutActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function savePushcutAction(
  _prev: PushcutActionResult | null,
  formData: FormData,
): Promise<PushcutActionResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const parsedSlots: PushcutSlotInput[] = [];

  for (const slot of PUSHCUT_SLOTS) {
    const parsed = slotSchema.safeParse({
      key: slot.key,
      webhookUrl: formData.get(`${slot.key}_webhookUrl`) ?? "",
      events: formData.getAll(`${slot.key}_events`),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    parsedSlots.push(parsed.data);
  }

  const current = await getPushcutStatus();

  // Cada canal ativo (com eventos escolhidos) precisa de um webhook válido —
  // já guardado antes, ou colado agora.
  for (const slot of parsedSlots) {
    if (slot.events.length === 0) continue;

    const label = PUSHCUT_SLOTS.find((s) => s.key === slot.key)?.label ?? slot.key;

    if (!slot.webhookUrl && !current.slots[slot.key].configured) {
      return {
        ok: false,
        error: `Cole a URL do webhook Pushcut do canal "${label}".`,
      };
    }

    if (slot.webhookUrl) {
      const validation = validatePushcutWebhookUrl(slot.webhookUrl);
      if (!validation.ok) {
        return {
          ok: false,
          error: `Webhook do canal "${label}": ${validation.error}`,
        };
      }
    }
  }

  if (parsedSlots.every((s) => s.events.length === 0)) {
    return {
      ok: false,
      error: "Escolha pelo menos um evento em algum dos canais.",
    };
  }

  try {
    await savePushcutCredentials(parsedSlots);
  } catch (error) {
    console.error("[pushcut] erro ao guardar:", error);
    const message =
      error instanceof Error &&
      // Mensagens de validação já são seguras para mostrar; erros de infra
      // (banco, chave de cifra ausente, etc.) não devem vazar detalhes.
      /webhook|url/i.test(error.message)
        ? error.message
        : "Não foi possível guardar a integração.";
    return { ok: false, error: message };
  }

  // Validação real: envia um push de confirmação por cada canal ativo. Se a
  // URL estiver errada, o utilizador descobre agora e não numa venda.
  const results: { label: string; ok: boolean; error?: string }[] = [];
  for (const slot of parsedSlots) {
    if (slot.events.length === 0) continue;
    const label = PUSHCUT_SLOTS.find((s) => s.key === slot.key)?.label ?? slot.key;
    const test = await sendPushcutNotification(
      slot.key,
      `Infinity · ${label} ✅`,
      `Se recebeu este alerta, o canal "${label}" está a funcionar.`,
      { force: true },
    );
    results.push({ label, ok: test.ok, error: test.error });
  }

  revalidatePath("/notificacoes");

  const failures = results.filter((r) => !r.ok);
  const successes = results.filter((r) => r.ok);

  if (failures.length > 0 && successes.length > 0) {
    // Nunca reportar sucesso total quando só um canal funcionou.
    return {
      ok: false,
      error: `Integração salva. O canal ${successes.map((s) => s.label).join(", ")} funcionou, mas o canal ${failures
        .map((f) => `${f.label} falhou (${f.error})`)
        .join(", ")}.`,
    };
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: `Configuração guardada, mas o envio de teste falhou — ${failures
        .map((f) => `${f.label}: ${f.error}`)
        .join(" · ")}`,
    };
  }

  return {
    ok: true,
    message: "Ligado! Verifique os pushes que acabou de receber no telemóvel.",
  };
}

export async function togglePushcutAction(formData: FormData): Promise<void> {
  const active = formData.get("active") === "true";
  if (!isDatabaseConfigured()) return;

  await setPushcutActive(active);
  revalidatePath("/notificacoes");
}

export async function testPushcutAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("slot") ?? "");
  const parsed = slotKeyEnum.safeParse(raw);
  if (!parsed.success) return;

  const slotKey: PushcutSlotKey = parsed.data;
  const label = PUSHCUT_SLOTS.find((s) => s.key === slotKey)?.label ?? slotKey;

  await sendPushcutNotification(
    slotKey,
    `Teste do Infinity · ${label} 🔔`,
    "Notificação de teste enviada a partir do painel.",
    { force: true },
  );
  revalidatePath("/notificacoes");
}
