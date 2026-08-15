import "server-only";

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/database/client";
import { visitorSessions } from "@/database/schema";
import {
  ATTRIBUTION_COOKIE,
  mergeAttribution,
  sanitizeAttribution,
  type UtmAttribution,
} from "@/features/attribution/utm";

export async function resolveCheckoutAttribution(
  workspaceId: string,
  current: Record<string, unknown>,
): Promise<{ sessionId: string | null; first: UtmAttribution; last: UtmAttribution }> {
  const cookieStore = await cookies();
  const anonymousId = cookieStore.get(ATTRIBUTION_COOKIE)?.value?.slice(0, 64);
  const sanitizedCurrent = sanitizeAttribution(current);
  if (!anonymousId) return { sessionId: null, first: sanitizedCurrent, last: sanitizedCurrent };

  const [session] = await getDb()
    .select({ anonymousId: visitorSessions.anonymousId, utm: visitorSessions.utm, lastUtm: visitorSessions.lastUtm })
    .from(visitorSessions)
    .where(and(eq(visitorSessions.workspaceId, workspaceId), eq(visitorSessions.anonymousId, anonymousId)))
    .limit(1);
  if (!session) return { sessionId: anonymousId, first: sanitizedCurrent, last: sanitizedCurrent };
  const firstBase = Object.keys(sanitizeAttribution(session.utm as Record<string, unknown>)).length
    ? sanitizeAttribution(session.utm as Record<string, unknown>)
    : sanitizedCurrent;
  const first = sanitizedCurrent.lp
    ? { ...firstBase, lp: sanitizedCurrent.lp }
    : firstBase;
  return {
    sessionId: session.anonymousId,
    first,
    last: mergeAttribution(session.lastUtm as Record<string, unknown>, sanitizedCurrent),
  };
}
