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
  type PushcutSlotInput,
  type PushcutSlotKey,
} from "@/features/notifications/pushcut";

const slotKeyEnum = z.enum(["sale_created", "sale_approved"]);

const slotSchema = z.object({
  key: slotKeyEnum,
  /** Vazio = manter a chave já guardada. */
  apiKey: z.string().trim(),
  notificationName: z.string().trim(),
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
      apiKey: formData.get(`${slot.key}_apiKey`) ?? "",
      notificationName: formData.get(`${slot.key}_notificationName`) ?? "",
      events: formData.getAll(`${slot.key}_events`),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    parsedSlots.push(parsed.data);
  }

  const current = await getPushcutStatus();

  // Cada canal ativo (com eventos escolhidos) precisa de nome e de chave —
  // ou já guardada antes, ou colada agora.
  for (const slot of parsedSlots) {
    if (slot.events.length === 0) continue;

    const label = PUSHCUT_SLOTS.find((s) => s.key === slot.key)?.label ?? slot.key;

    if (!slot.notificationName) {
      return {
        ok: false,
        error: `Informe o nome da notificação do canal "${label}".`,
      };
    }
    if (!slot.apiKey && !current.slots[slot.key].configured) {
      return {
        ok: false,
        error: `Cole a chave de API do canal "${label}".`,
      };
    }
    if (slot.apiKey && slot.apiKey.length < 10) {
      return {
        ok: false,
        error: `A chave de API do canal "${label}" parece incompleta.`,
      };
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

    // Validação real: envia um push de confirmação por cada canal ativo. Se
    // a chave ou o nome estiverem errados, o utilizador descobre agora e não
    // numa venda.
    const failures: string[] = [];
    for (const slot of parsedSlots) {
      if (slot.events.length === 0) continue;
      const label = PUSHCUT_SLOTS.find((s) => s.key === slot.key)?.label ?? slot.key;
      const test = await sendPushcutNotification(
        slot.key,
        `Infinity · ${label} ✅`,
        `Se recebeu este alerta, o canal "${label}" está a funcionar.`,
        { force: true },
      );
      if (!test.ok) failures.push(`${label}: ${test.error}`);
    }

    revalidatePath("/notificacoes");

    if (failures.length > 0) {
      return {
        ok: false,
        error: `Configuração guardada, mas o envio de teste falhou — ${failures.join(" · ")}`,
      };
    }

    return {
      ok: true,
      message: "Ligado! Verifique os pushes que acabou de receber no telemóvel.",
    };
  } catch (error) {
    console.error("[pushcut] erro ao guardar:", error);
    return { ok: false, error: "Não foi possível guardar a integração." };
  }
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
