import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { landingPageEvents, landingPages } from "@/database/schema";
import { parseUserAgent } from "@/features/analytics/track";

import type { LandingEventInput } from "@/validations/landing-page";

/**
 * Limite de taxa por IP, em memória do processo.
 *
 * Não é um limitador distribuído — em serverless cada instância tem o seu
 * contador. Serve ao propósito real aqui: travar um laço acidental ou um
 * robô simples inundando a tabela de eventos. Se o projeto vier a ligar o
 * Upstash (já previsto no `.env.example`), esta função é o ponto único a
 * trocar.
 */
const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, now = Date.now()): boolean {
  const current = hits.get(key);

  if (!current || current.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // Limpeza preguiçosa: evita o mapa crescer sem limite em processos longos.
    if (hits.size > 5000) {
      for (const [entryKey, value] of hits) {
        if (value.resetAt <= now) hits.delete(entryKey);
      }
    }
    return true;
  }

  if (current.count >= MAX_EVENTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

export interface LandingEventContext {
  userAgent: string | null;
}

/**
 * Grava um evento da landing pública.
 *
 * A página é validada contra o banco antes de gravar: um id inventado no
 * corpo do pedido não cria linha nenhuma.
 */
export async function recordLandingEvent(
  input: LandingEventInput,
  ctx: LandingEventContext,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const db = getDb();

  const [page] = await db
    .select({
      id: landingPages.id,
      workspaceId: landingPages.workspaceId,
    })
    .from(landingPages)
    .where(
      and(eq(landingPages.id, input.pageId), isNull(landingPages.deletedAt)),
    )
    .limit(1);

  if (!page) return false;

  const { deviceType } = parseUserAgent(ctx.userAgent);

  await db.insert(landingPageEvents).values({
    workspaceId: page.workspaceId,
    landingPageId: page.id,
    eventName: input.event,
    anonymousId: input.anonymousId,
    valueCents: input.valueCents ?? null,
    currency: input.currency ?? null,
    deviceType,
    source: input.source?.slice(0, 120) ?? null,
    campaign: input.campaign?.slice(0, 120) ?? null,
    properties: input.blockId ? { blockId: input.blockId } : {},
  });

  return true;
}
