import "server-only";

import { createHash } from "node:crypto";

interface RateLimitOptions {
  namespace: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

const memoryWindows = new Map<string, { count: number; expiresAt: number }>();

function safeKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function memoryRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const key = `${options.namespace}:${safeKey(options.identifier)}`;
  const current = memoryWindows.get(key);
  const entry =
    !current || current.expiresAt <= now
      ? { count: 0, expiresAt: now + options.windowSeconds * 1000 }
      : current;
  entry.count += 1;
  memoryWindows.set(key, entry);

  // Limpeza oportunista para o fallback local não crescer sem limite.
  if (memoryWindows.size > 2_000) {
    for (const [candidate, value] of memoryWindows) {
      if (value.expiresAt <= now) memoryWindows.delete(candidate);
    }
  }

  return {
    allowed: entry.count <= options.limit,
    remaining: Math.max(0, options.limit - entry.count),
  };
}

/**
 * Fixed window distribuída via Upstash REST. Sem Redis configurado, conserva
 * proteção por processo para desenvolvimento; produção deve configurar as
 * duas variáveis para que o limite seja partilhado entre instâncias.
 */
export async function rateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryRateLimit(options);

  const key = `infinity:${options.namespace}:${safeKey(options.identifier)}`;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, options.windowSeconds, "NX"],
      ]),
      cache: "no-store",
    });
    if (!response.ok) return memoryRateLimit(options);
    const payload = (await response.json()) as Array<{ result?: unknown }>;
    const count = Number(payload[0]?.result);
    if (!Number.isFinite(count)) return memoryRateLimit(options);
    return {
      allowed: count <= options.limit,
      remaining: Math.max(0, options.limit - count),
    };
  } catch {
    return memoryRateLimit(options);
  }
}
