import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  landingPages,
  orders,
  pixelEvents,
  pixels,
  workspaces,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { withTrackingDefaults } from "@/features/landing-pages/defaults";
import type {
  PixelConnectionStatus,
  PixelRow,
  PixelType,
  PurchaseRule,
} from "@/features/pixels/types";
import { pickEffectivePixels } from "@/features/pixels/fallback";
import { resolvePurchaseRule } from "@/features/pixels/rules";

// Reexportados para não quebrar quem já importa tipos/labels daqui —
// mas o conteúdo client-safe vive em `./types` (sem tocar em `postgres`).
export {
  PIXEL_TYPE_INFO,
  PIXEL_CONNECTION_STATUS_INFO,
  type PixelType,
  type PixelRow,
  type PixelConnectionStatus,
  type PurchaseRule,
} from "@/features/pixels/types";

/** Tipos geridos pela aba Meta — os únicos que podem ser específicos de landing page. */
const META_PIXEL_TYPES = ["meta_pixel", "meta_capi"] as const;
/** Tipos que continuam só globais (fora do escopo desta feature). */
const OTHER_PUBLIC_PIXEL_TYPES = [
  "gtm",
  "ga4",
  "google_ads",
  "tiktok_pixel",
] as const;

function toPixelRow(p: typeof pixels.$inferSelect): PixelRow {
  return {
    id: p.id,
    name: p.name,
    type: p.type as PixelType,
    pixelId: p.pixelId,
    isActive: p.isActive,
    hasToken: Boolean(p.encryptedToken),
    lastActivityAt: p.lastActivityAt,
    landingPageId: p.landingPageId,
    tokenPreview: p.tokenPreview,
    testEventCode: p.testEventCode,
    connectionStatus: p.connectionStatus as PixelConnectionStatus,
    lastTestedAt: p.lastTestedAt,
    lastTestError: p.lastTestError,
  };
}

/** Pixels globais do workspace (aba "Geral" — GTM/GA4/Ads/TikTok/UTMify/Meta). */
export async function listPixels(
  requestedWorkspaceId?: string,
): Promise<PixelRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());

  const rows = await db
    .select()
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        isNull(pixels.landingPageId),
        isNull(pixels.deletedAt),
      ),
    )
    .orderBy(desc(pixels.createdAt));

  return rows.map(toPixelRow);
}

/** Confirma que a landing page pertence ao workspace atual — nunca confiar num id vindo do cliente. */
export async function landingPageBelongsToWorkspace(
  landingPageId: string,
  requestedWorkspaceId?: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());

  const [lp] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, landingPageId),
        eq(landingPages.workspaceId, workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(lp);
}

/**
 * Pixels Meta (`meta_pixel`/`meta_capi`) exclusivos de uma landing page.
 * Verifica que a página pertence ao workspace atual antes de tudo — nunca
 * confia no `landingPageId` vindo do cliente.
 */
export async function listLandingPagePixels(
  landingPageId: string,
  requestedWorkspaceId?: string,
): Promise<PixelRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());

  const [lp] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, landingPageId),
        eq(landingPages.workspaceId, workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .limit(1);
  if (!lp) return [];

  const rows = await db
    .select()
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        eq(pixels.landingPageId, landingPageId),
        isNull(pixels.deletedAt),
        inArray(pixels.type, META_PIXEL_TYPES),
      ),
    )
    .orderBy(pixels.createdAt);

  return rows.map(toPixelRow);
}

/**
 * Resolve os pixels efetivamente aplicáveis a uma landing page para um tipo
 * (fallback: específicos da página > globais do workspace). Server-only —
 * os registros trazem `encryptedToken` cru; nunca expor este retorno ao
 * navegador. Única implementação da regra de fallback (ver `./fallback.ts`),
 * reutilizada tanto pelo lado público (`getActivePixelsForPublic`) quanto
 * pela Conversions API (`meta-capi.ts`).
 */
export async function resolveEffectivePixelRows(
  landingPageId: string | null,
  type: PixelType,
  requestedWorkspaceId?: string,
): Promise<(typeof pixels.$inferSelect)[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await resolvePublicWorkspaceId(
    landingPageId,
    requestedWorkspaceId,
  );
  if (!workspaceId) return [];

  const candidates = await db
    .select()
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        eq(pixels.type, type),
        isNull(pixels.deletedAt),
        landingPageId
          ? or(
              eq(pixels.landingPageId, landingPageId),
              isNull(pixels.landingPageId),
            )
          : isNull(pixels.landingPageId),
      ),
    );

  return pickEffectivePixels(candidates, landingPageId);
}

/**
 * Resolve o tenant a partir da própria landing page pública. Quando um
 * chamador interno informa o workspace esperado, uma página de outro tenant
 * é recusada em vez de trocar silenciosamente de contexto.
 */
async function resolvePublicWorkspaceId(
  landingPageId: string | null,
  requestedWorkspaceId?: string,
): Promise<string | null> {
  if (!landingPageId) {
    return requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());
  }

  const db = getDb();
  const [page] = await db
    .select({ workspaceId: landingPages.workspaceId })
    .from(landingPages)
    .where(
      and(eq(landingPages.id, landingPageId), isNull(landingPages.deletedAt)),
    )
    .limit(1);

  if (
    !page ||
    (requestedWorkspaceId && page.workspaceId !== requestedWorkspaceId)
  ) {
    return null;
  }
  return page.workspaceId;
}

/** Resolve o conjunto Meta como um todo, para o fallback ser por página e
 * não por tipo. Um pixel CAPI é também um pixel de navegador; o token apenas
 * habilita o envio server-side. */
export async function resolveEffectiveMetaRows(
  landingPageId: string | null,
  requestedWorkspaceId?: string,
): Promise<(typeof pixels.$inferSelect)[]> {
  if (!isDatabaseConfigured()) return [];

  const workspaceId = await resolvePublicWorkspaceId(
    landingPageId,
    requestedWorkspaceId,
  );
  if (!workspaceId) return [];

  const db = getDb();
  const candidates = await db
    .select()
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, workspaceId),
        inArray(pixels.type, META_PIXEL_TYPES),
        isNull(pixels.deletedAt),
        landingPageId
          ? or(
              eq(pixels.landingPageId, landingPageId),
              isNull(pixels.landingPageId),
            )
          : isNull(pixels.landingPageId),
      ),
    );

  return pickEffectivePixels(candidates, landingPageId);
}

/**
 * Pixels ativos para injeção nas páginas públicas.
 * Retorna apenas dados que podem ir ao navegador — nunca tokens.
 *
 * `landingPageId` aplica a regra de fallback só para o Meta Pixel (os
 * demais tipos continuam globais, comportamento inalterado).
 */
export async function getActivePixelsForPublic(
  landingPageId?: string | null,
  /**
   * GTM/GA4/Google Ads/TikTok continuam só globais — este parâmetro replica
   * o antigo `inheritWorkspacePixels` da landing page só para esses tipos
   * (o Meta Pixel resolve seu próprio fallback independentemente disso).
   */
  includeOtherGlobals = true,
): Promise<{ type: PixelType; pixelId: string }[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const db = getDb();
    const workspaceId = await resolvePublicWorkspaceId(landingPageId ?? null);
    if (!workspaceId) return [];

    const metaRows = await resolveEffectiveMetaRows(landingPageId ?? null);

    const otherRows = includeOtherGlobals
      ? await db
          .select({ type: pixels.type, pixelId: pixels.pixelId })
          .from(pixels)
          .where(
            and(
              eq(pixels.workspaceId, workspaceId),
              eq(pixels.isActive, true),
              isNull(pixels.deletedAt),
              isNull(pixels.landingPageId),
              inArray(pixels.type, OTHER_PUBLIC_PIXEL_TYPES),
            ),
          )
      : [];

    return [
      ...metaRows.map((r) => ({
        type: "meta_pixel" as PixelType,
        pixelId: r.pixelId,
      })),
      ...otherRows,
    ]
      .filter((r): r is { type: PixelType; pixelId: string } =>
        Boolean(r.pixelId),
      )
      .filter(
        (row, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.type === row.type && candidate.pixelId === row.pixelId,
          ) === index,
      );
  } catch {
    // Páginas públicas nunca podem quebrar por causa de rastreamento.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Regra "contar pedidos gerados como compra" — global (workspace) + override
// por landing page.
// ---------------------------------------------------------------------------

export interface WorkspaceMetaSettings {
  countGeneratedOrdersAsPurchase: boolean;
}

const DEFAULT_WORKSPACE_META_SETTINGS: WorkspaceMetaSettings = {
  countGeneratedOrdersAsPurchase: false,
};

export async function getWorkspaceMetaSettings(
  requestedWorkspaceId?: string,
): Promise<WorkspaceMetaSettings> {
  if (!isDatabaseConfigured()) return DEFAULT_WORKSPACE_META_SETTINGS;

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());

  const [row] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  return {
    countGeneratedOrdersAsPurchase:
      settings.countGeneratedOrdersAsPurchase === true,
  };
}

export interface LandingPageMetaSettings {
  /** Regra efetiva já resolvida (override da página > global) */
  rule: PurchaseRule;
  /** `true` quando a página tem override próprio (não está herdando o global) */
  hasOverride: boolean;
}

/** Valida que a landing page pertence ao workspace atual antes de ler tracking. */
export async function getLandingPageMetaSettings(
  landingPageId: string | null,
  requestedWorkspaceId?: string,
): Promise<LandingPageMetaSettings> {
  const workspaceId = await resolvePublicWorkspaceId(
    landingPageId,
    requestedWorkspaceId,
  );
  const workspaceSettings = await getWorkspaceMetaSettings(
    workspaceId ?? requestedWorkspaceId,
  );

  if (!landingPageId || !isDatabaseConfigured()) {
    return {
      rule: resolvePurchaseRule(
        workspaceSettings.countGeneratedOrdersAsPurchase,
        null,
      ),
      hasOverride: false,
    };
  }

  const db = getDb();
  if (!workspaceId) {
    return {
      rule: resolvePurchaseRule(
        workspaceSettings.countGeneratedOrdersAsPurchase,
        null,
      ),
      hasOverride: false,
    };
  }

  const [row] = await db
    .select({ tracking: landingPages.tracking })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, landingPageId),
        eq(landingPages.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  const override = row
    ? withTrackingDefaults(row.tracking).countGeneratedOrdersAsPurchase
    : null;

  return {
    rule: resolvePurchaseRule(
      workspaceSettings.countGeneratedOrdersAsPurchase,
      override,
    ),
    hasOverride: override !== null,
  };
}

// ---------------------------------------------------------------------------
// Indicadores do cabeçalho
// ---------------------------------------------------------------------------

export interface PixelOverviewStats {
  activePixels: number;
  landingPagesConfigured: number;
  eventsLast24h: number;
  eventsWithError: number;
}

export async function getPixelOverviewStats(
  requestedWorkspaceId?: string,
): Promise<PixelOverviewStats> {
  if (!isDatabaseConfigured()) {
    return {
      activePixels: 0,
      landingPagesConfigured: 0,
      eventsLast24h: 0,
      eventsWithError: 0,
    };
  }

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [activePixelsRows, lpConfiguredRows, events24hRows, errorsRows] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(pixels)
        .where(
          and(
            eq(pixels.workspaceId, workspaceId),
            eq(pixels.isActive, true),
            isNull(pixels.deletedAt),
          ),
        ),
      db
        .selectDistinct({ landingPageId: pixels.landingPageId })
        .from(pixels)
        .where(
          and(
            eq(pixels.workspaceId, workspaceId),
            isNull(pixels.deletedAt),
            sql`${pixels.landingPageId} is not null`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(pixelEvents)
        .where(
          and(
            eq(pixelEvents.workspaceId, workspaceId),
            gte(pixelEvents.createdAt, since),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(pixelEvents)
        .where(
          and(
            eq(pixelEvents.workspaceId, workspaceId),
            eq(pixelEvents.status, "failed"),
            gte(pixelEvents.createdAt, since),
          ),
        ),
    ]);

  return {
    activePixels: activePixelsRows[0]?.count ?? 0,
    landingPagesConfigured: lpConfiguredRows.length,
    eventsLast24h: events24hRows[0]?.count ?? 0,
    eventsWithError: errorsRows[0]?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Histórico de eventos (log)
// ---------------------------------------------------------------------------

export interface PixelEventFilters {
  page?: number;
  pageSize?: number;
  landingPageId?: string;
  pixelId?: string;
  eventName?: string;
  status?: string;
  q?: string;
}

export interface PixelEventRow {
  id: string;
  createdAt: Date;
  landingPageId: string | null;
  landingPageName: string | null;
  orderId: string | null;
  orderReference: string | null;
  pixelId: string;
  pixelName: string;
  pixelType: PixelType;
  eventName: string;
  triggerType: string | null;
  channel: string;
  status: string;
  retryCount: number;
  httpStatus: number | null;
  errorCode: string | null;
  error: string | null;
  response: unknown;
}

/** Pixels do workspace (globais e por landing page) para o filtro do log. */
export async function listAllPixelsForFilter(
  requestedWorkspaceId?: string,
): Promise<{ id: string; name: string }[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());

  return db
    .select({ id: pixels.id, name: pixels.name })
    .from(pixels)
    .where(and(eq(pixels.workspaceId, workspaceId), isNull(pixels.deletedAt)))
    .orderBy(pixels.name);
}

const DEFAULT_EVENT_PAGE_SIZE = 20;

export async function listPixelEvents(
  filters: PixelEventFilters,
  requestedWorkspaceId?: string,
): Promise<{
  rows: PixelEventRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    100,
    Math.max(1, filters.pageSize ?? DEFAULT_EVENT_PAGE_SIZE),
  );

  if (!isDatabaseConfigured()) {
    return { rows: [], total: 0, page, pageSize };
  }

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());

  const conditions = [eq(pixelEvents.workspaceId, workspaceId)];
  if (filters.landingPageId) {
    conditions.push(eq(pixelEvents.landingPageId, filters.landingPageId));
  }
  if (filters.pixelId) {
    conditions.push(eq(pixelEvents.pixelId, filters.pixelId));
  }
  if (filters.eventName) {
    conditions.push(eq(pixelEvents.eventName, filters.eventName));
  }
  if (filters.status) {
    conditions.push(eq(pixelEvents.status, filters.status));
  }
  if (filters.q) {
    const q = `%${filters.q.trim()}%`;
    conditions.push(
      sql`(${orders.reference} ilike ${q} or ${pixelEvents.orderId}::text ilike ${q})`,
    );
  }

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: pixelEvents.id,
        createdAt: pixelEvents.createdAt,
        landingPageId: pixelEvents.landingPageId,
        landingPageName: landingPages.publicName,
        orderId: pixelEvents.orderId,
        orderReference: orders.reference,
        pixelId: pixelEvents.pixelId,
        pixelName: pixels.name,
        pixelType: pixels.type,
        eventName: pixelEvents.eventName,
        triggerType: pixelEvents.triggerType,
        channel: pixelEvents.channel,
        status: pixelEvents.status,
        retryCount: pixelEvents.retryCount,
        httpStatus: pixelEvents.httpStatus,
        errorCode: pixelEvents.errorCode,
        error: pixelEvents.error,
        response: pixelEvents.response,
      })
      .from(pixelEvents)
      .innerJoin(pixels, eq(pixels.id, pixelEvents.pixelId))
      .leftJoin(landingPages, eq(landingPages.id, pixelEvents.landingPageId))
      .leftJoin(orders, eq(orders.id, pixelEvents.orderId))
      .where(where)
      .orderBy(desc(pixelEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pixelEvents)
      .innerJoin(pixels, eq(pixels.id, pixelEvents.pixelId))
      .leftJoin(orders, eq(orders.id, pixelEvents.orderId))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, pixelType: r.pixelType as PixelType })),
    total: totalRows[0]?.count ?? 0,
    page,
    pageSize,
  };
}
