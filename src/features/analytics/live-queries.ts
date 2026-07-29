import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { analyticsEvents, visitorSessions } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface LiveSession {
  id: string;
  anonymousId: string;
  currentPage: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  countryCode: string | null;
  city: string | null;
  utmSource: string | null;
  pageViews: number;
  durationSeconds: number;
  lastSeenAt: Date;
}

export interface LiveEvent {
  id: string;
  eventName: string;
  page: string | null;
  occurredAt: Date;
  anonymousId: string | null;
  countryCode: string | null;
  deviceType: string | null;
}

export interface FunnelStep {
  label: string;
  event: string;
  count: number;
}

export interface LiveSnapshot {
  onlineNow: number;
  visitorsToday: number;
  visitors24h: number;
  pageViewsToday: number;
  sessions: LiveSession[];
  events: LiveEvent[];
  funnel: FunnelStep[];
  generatedAt: string;
}

/** Considera "online" quem teve atividade nos últimos 5 minutos. */
const ONLINE_WINDOW = sql`now() - interval '5 minutes'`;

export async function getLiveSnapshot(): Promise<LiveSnapshot | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const ws = eq(visitorSessions.workspaceId, workspaceId);

  const [online] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visitorSessions)
    .where(and(ws, gte(visitorSessions.lastSeenAt, ONLINE_WINDOW)));

  const [today] = await db
    .select({
      visitantes: sql<number>`count(*)::int`,
      views: sql<number>`coalesce(sum(${visitorSessions.pageViews}), 0)::int`,
    })
    .from(visitorSessions)
    .where(and(ws, sql`${visitorSessions.createdAt} >= date_trunc('day', now())`));

  const [last24] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visitorSessions)
    .where(and(ws, sql`${visitorSessions.createdAt} >= now() - interval '24 hours'`));

  const sessions = await db
    .select({
      id: visitorSessions.id,
      anonymousId: visitorSessions.anonymousId,
      currentPage: visitorSessions.currentPage,
      deviceType: visitorSessions.deviceType,
      browser: visitorSessions.browser,
      os: visitorSessions.os,
      countryCode: visitorSessions.countryCode,
      city: visitorSessions.city,
      utm: visitorSessions.utm,
      pageViews: visitorSessions.pageViews,
      durationSeconds: visitorSessions.durationSeconds,
      lastSeenAt: visitorSessions.lastSeenAt,
    })
    .from(visitorSessions)
    .where(and(ws, gte(visitorSessions.lastSeenAt, ONLINE_WINDOW)))
    .orderBy(desc(visitorSessions.lastSeenAt))
    .limit(40);

  const events = await db
    .select({
      id: analyticsEvents.id,
      eventName: analyticsEvents.eventName,
      page: analyticsEvents.page,
      occurredAt: analyticsEvents.occurredAt,
      anonymousId: visitorSessions.anonymousId,
      countryCode: visitorSessions.countryCode,
      deviceType: visitorSessions.deviceType,
    })
    .from(analyticsEvents)
    .leftJoin(visitorSessions, eq(analyticsEvents.sessionId, visitorSessions.id))
    .where(eq(analyticsEvents.workspaceId, workspaceId))
    .orderBy(desc(analyticsEvents.occurredAt))
    .limit(50);

  // Funil das últimas 24h
  const funnelRows = await db
    .select({
      eventName: analyticsEvents.eventName,
      n: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.workspaceId, workspaceId),
        sql`${analyticsEvents.occurredAt} >= now() - interval '24 hours'`,
      ),
    )
    .groupBy(analyticsEvents.eventName);

  const countOf = (name: string) =>
    funnelRows.find((r) => r.eventName === name)?.n ?? 0;

  const funnel: FunnelStep[] = [
    { label: "Visitantes", event: "page_view", count: countOf("page_view") },
    { label: "Viu produto", event: "view_content", count: countOf("view_content") },
    { label: "Clicou comprar", event: "click_buy", count: countOf("click_buy") },
    { label: "Abriu checkout", event: "checkout_opened", count: countOf("checkout_opened") },
    { label: "Pagamento criado", event: "payment_created", count: countOf("payment_created") },
  ];

  return {
    onlineNow: online?.n ?? 0,
    visitorsToday: today?.visitantes ?? 0,
    visitors24h: last24?.n ?? 0,
    pageViewsToday: today?.views ?? 0,
    sessions: sessions.map((s) => ({
      id: s.id,
      anonymousId: s.anonymousId,
      currentPage: s.currentPage,
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      countryCode: s.countryCode,
      city: s.city,
      utmSource:
        (s.utm as Record<string, string> | null)?.utm_source ?? null,
      pageViews: s.pageViews,
      durationSeconds: s.durationSeconds,
      lastSeenAt: s.lastSeenAt,
    })),
    events,
    funnel,
    generatedAt: new Date().toISOString(),
  };
}
