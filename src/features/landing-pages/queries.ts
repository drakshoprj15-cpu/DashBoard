import { cache } from "react";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  landingPageEvents,
  landingPages,
  landingPageVersions,
  orders,
  products,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import {
  withContentDefaults,
  withCustomCodeDefaults,
  withSeoDefaults,
  withThemeDefaults,
  withTrackingDefaults,
} from "./defaults";
import { parseProductSnapshot, resolveLandingProduct } from "./product-data";
import {
  asDeploymentStatus,
  asHostingProvider,
  type LandingContentDoc,
  type LandingCustomCode,
  type LandingDeployment,
  type LandingProductData,
  type LandingSeo,
  type LandingSnapshot,
  type LandingStatus,
  type LandingTheme,
  type LandingTracking,
} from "./types";

export interface LandingPageMetrics {
  views: number;
  uniqueVisitors: number;
  ctaClicks: number;
  addToCart: number;
  checkouts: number;
  purchases: number;
  conversionRate: number;
}

const EMPTY_METRICS: LandingPageMetrics = {
  views: 0,
  uniqueVisitors: 0,
  ctaClicks: 0,
  addToCart: 0,
  checkouts: 0,
  purchases: 0,
  conversionRate: 0,
};

export interface LandingPageRow {
  id: string;
  name: string;
  publicName: string | null;
  slug: string;
  status: LandingStatus;
  template: string | null;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  publishedVersion: number | null;
  publishedAt: Date | null;
  scheduledPublishAt: Date | null;
  pausedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
  createdAt: Date;
  /** Imagem do rascunho, do produto ou da marca — miniatura do cartão. */
  thumbnailUrl: string | null;
  hasUnpublishedChanges: boolean;
  /** Onde a página é servida e como correu o último envio */
  deployment: LandingDeployment;
  metrics: LandingPageMetrics;
}

/**
 * Estado exibido na interface. `status` no banco guarda apenas o ciclo de
 * publicação; pausa, agendamento e erro são colunas próprias, e a UI precisa
 * de um único valor para filtrar e colorir.
 */
function resolveStatus(row: {
  status: string;
  pausedAt: Date | null;
  scheduledPublishAt: Date | null;
  publishedAt: Date | null;
  lastError: string | null;
}): LandingStatus {
  if (row.lastError) return "error";
  if (row.pausedAt) return "paused";
  if (row.scheduledPublishAt && row.scheduledPublishAt > new Date()) {
    return "scheduled";
  }
  return row.status === "published" && row.publishedAt ? "published" : "draft";
}

/** Primeira imagem do documento, para a miniatura da listagem. */
function findThumbnail(content: LandingContentDoc): string | null {
  for (const block of content.blocks) {
    for (const key of ["imageUrl", "posterUrl", "images"]) {
      const value = block.props?.[key];
      if (typeof value === "string" && value.trim().startsWith("http")) {
        return value.trim();
      }
      if (typeof value === "string" && value.includes("\n")) {
        const first = value.split("\n")[0]?.trim();
        if (first) return first;
      }
      if (Array.isArray(value)) {
        const first = value.find((v) => typeof v === "string");
        if (typeof first === "string") return first;
      }
    }
  }
  return null;
}

/** Listagem do painel, com métricas reais agregadas dos eventos. */
export async function listLandingPages(
  requestedWorkspaceId?: string,
): Promise<LandingPageRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId =
    requestedWorkspaceId ?? (await getOrCreateDefaultWorkspace());

  const rows = await db
    .select({
      id: landingPages.id,
      name: landingPages.name,
      publicName: landingPages.publicName,
      slug: landingPages.slug,
      status: landingPages.status,
      template: landingPages.template,
      productId: landingPages.productId,
      productName: products.name,
      productSlug: products.slug,
      productMainImageUrl: products.mainImageUrl,
      content: landingPages.content,
      publishedVersion: landingPages.publishedVersion,
      draftVersion: landingPages.draftVersion,
      publishedAt: landingPages.publishedAt,
      scheduledPublishAt: landingPages.scheduledPublishAt,
      pausedAt: landingPages.pausedAt,
      lastError: landingPages.lastError,
      logoUrl: landingPages.logoUrl,
      hostingProvider: landingPages.hostingProvider,
      deploymentUrl: landingPages.deploymentUrl,
      deploymentProjectId: landingPages.deploymentProjectId,
      deploymentId: landingPages.deploymentId,
      deploymentStatus: landingPages.deploymentStatus,
      deploymentLog: landingPages.deploymentLog,
      deploymentUpdatedAt: landingPages.deploymentUpdatedAt,
      updatedAt: landingPages.updatedAt,
      createdAt: landingPages.createdAt,
    })
    .from(landingPages)
    .leftJoin(products, eq(products.id, landingPages.productId))
    .where(
      and(
        eq(landingPages.workspaceId, workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .orderBy(desc(landingPages.updatedAt));

  if (rows.length === 0) return [];

  const metricsByPage = await aggregateMetrics(
    workspaceId,
    rows.map((r) => r.id),
  );

  return rows.map((row) => {
    const content = withContentDefaults(row.content);
    return {
      id: row.id,
      name: row.name,
      publicName: row.publicName,
      slug: row.slug,
      status: resolveStatus(row),
      template: row.template,
      productId: row.productId,
      productName: row.productName,
      productSlug: row.productSlug,
      publishedVersion: row.publishedVersion,
      publishedAt: row.publishedAt,
      scheduledPublishAt: row.scheduledPublishAt,
      pausedAt: row.pausedAt,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      thumbnailUrl:
        findThumbnail(content) ?? row.productMainImageUrl ?? row.logoUrl,
      hasUnpublishedChanges:
        row.publishedVersion === null ||
        row.draftVersion > row.publishedVersion,
      deployment: {
        provider: asHostingProvider(row.hostingProvider),
        status: asDeploymentStatus(row.deploymentStatus),
        url: row.deploymentUrl,
        projectId: row.deploymentProjectId,
        deploymentId: row.deploymentId,
        log: row.deploymentLog,
        updatedAt: row.deploymentUpdatedAt,
      },
      metrics: metricsByPage.get(row.id) ?? EMPTY_METRICS,
    };
  });
}

/**
 * Métricas por página.
 *
 * Visitas e cliques vêm dos eventos da própria landing; **conversões vêm de
 * pedidos pagos**, não do navegador — o link do checkout carrega `?lp=<id>`,
 * que o checkout grava em `orders.utm.lp`. Assim o número de vendas mostrado
 * no painel é o mesmo que o financeiro vê, e não uma contagem de pixel.
 */
async function aggregateMetrics(
  workspaceId: string,
  pageIds: string[],
): Promise<Map<string, LandingPageMetrics>> {
  const result = new Map<string, LandingPageMetrics>();
  if (pageIds.length === 0) return result;

  const db = getDb();

  const [eventRows, orderRows] = await Promise.all([
    db
      .select({
        landingPageId: landingPageEvents.landingPageId,
        views: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'page_view')::int`,
        uniqueVisitors: sql<number>`count(distinct ${landingPageEvents.anonymousId})::int`,
        ctaClicks: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'cta_click')::int`,
        addToCart: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'add_to_cart')::int`,
        checkouts: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'initiate_checkout')::int`,
      })
      .from(landingPageEvents)
      .where(
        and(
          eq(landingPageEvents.workspaceId, workspaceId),
          inArray(landingPageEvents.landingPageId, pageIds),
        ),
      )
      .groupBy(landingPageEvents.landingPageId),
    db
      .select({
        landingPageId: sql<string>`${orders.utm} ->> 'lp'`,
        purchases: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.workspaceId, workspaceId),
          inArray(orders.status, ["paid", "shipped", "delivered"]),
          inArray(sql<string>`${orders.utm} ->> 'lp'`, pageIds),
        ),
      )
      .groupBy(sql`${orders.utm} ->> 'lp'`),
  ]);

  const purchasesByPage = new Map(
    orderRows.map((row) => [row.landingPageId, row.purchases]),
  );

  for (const row of eventRows) {
    const purchases = purchasesByPage.get(row.landingPageId) ?? 0;
    result.set(row.landingPageId, {
      views: row.views,
      uniqueVisitors: row.uniqueVisitors,
      ctaClicks: row.ctaClicks,
      addToCart: row.addToCart,
      checkouts: row.checkouts,
      purchases,
      conversionRate:
        row.views > 0 ? Math.round((purchases / row.views) * 10000) / 100 : 0,
    });
  }

  // Página com venda mas sem evento registado (visitante com bloqueador de
  // scripts) mesmo assim aparece com a conversão contada.
  for (const [pageId, purchases] of purchasesByPage) {
    if (!result.has(pageId)) {
      result.set(pageId, { ...EMPTY_METRICS, purchases });
    }
  }

  return result;
}

export interface LandingPageDetail {
  id: string;
  name: string;
  publicName: string;
  slug: string;
  status: LandingStatus;
  template: string | null;
  content: LandingContentDoc;
  theme: LandingTheme;
  seo: LandingSeo;
  tracking: LandingTracking;
  customCode: LandingCustomCode;
  productId: string | null;
  productSync: boolean;
  product: LandingProductData | null;
  /** Cópia congelada, quando existir — mostrada na aba Produto */
  productSnapshot: LandingProductData | null;
  logoUrl: string;
  faviconUrl: string;
  language: string;
  country: string;
  currency: string;
  publishedVersion: number | null;
  draftVersion: number;
  publishedAt: Date | null;
  scheduledPublishAt: Date | null;
  pausedAt: Date | null;
  previewToken: string | null;
  lastError: string | null;
  hasUnpublishedChanges: boolean;
  /** Onde a página é servida e como correu o último envio. */
  deployment: LandingDeployment;
  updatedAt: Date;
  metrics: LandingPageMetrics;
}

/** Página completa para o editor. Sempre filtrada pelo workspace da sessão. */
export async function getLandingPage(
  id: string,
): Promise<LandingPageDetail | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .select()
    .from(landingPages)
    .where(
      and(
        eq(landingPages.id, id),
        eq(landingPages.workspaceId, workspaceId),
        isNull(landingPages.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [product, metrics] = await Promise.all([
    resolveLandingProduct(
      {
        productId: row.productId,
        productSync: row.productSync,
        productSnapshot: row.productSnapshot,
      },
      workspaceId,
    ),
    aggregateMetrics(workspaceId, [row.id]),
  ]);

  return {
    id: row.id,
    name: row.name,
    publicName: row.publicName ?? "",
    slug: row.slug,
    status: resolveStatus(row),
    template: row.template,
    content: withContentDefaults(row.content),
    theme: withThemeDefaults(row.theme),
    seo: withSeoDefaults(row.seo),
    tracking: withTrackingDefaults(row.tracking),
    customCode: withCustomCodeDefaults(row.customCode),
    productId: row.productId,
    productSync: row.productSync,
    product,
    productSnapshot: parseProductSnapshot(row.productSnapshot),
    logoUrl: row.logoUrl ?? "",
    faviconUrl: row.faviconUrl ?? "",
    language: row.language,
    country: row.country,
    currency: row.currency,
    publishedVersion: row.publishedVersion,
    draftVersion: row.draftVersion,
    publishedAt: row.publishedAt,
    scheduledPublishAt: row.scheduledPublishAt,
    pausedAt: row.pausedAt,
    previewToken: row.previewToken,
    lastError: row.lastError,
    hasUnpublishedChanges:
      row.publishedVersion === null || row.draftVersion > row.publishedVersion,
    deployment: {
      provider: asHostingProvider(row.hostingProvider),
      status: asDeploymentStatus(row.deploymentStatus),
      url: row.deploymentUrl,
      projectId: row.deploymentProjectId,
      deploymentId: row.deploymentId,
      log: row.deploymentLog,
      updatedAt: row.deploymentUpdatedAt,
    },
    updatedAt: row.updatedAt,
    metrics: metrics.get(row.id) ?? EMPTY_METRICS,
  };
}

export interface LandingVersionRow {
  id: string;
  version: number;
  note: string | null;
  isPublished: boolean;
  createdAt: Date;
}

export async function listLandingVersions(
  landingPageId: string,
): Promise<LandingVersionRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  return db
    .select({
      id: landingPageVersions.id,
      version: landingPageVersions.version,
      note: landingPageVersions.note,
      isPublished: landingPageVersions.isPublished,
      createdAt: landingPageVersions.createdAt,
    })
    .from(landingPageVersions)
    .where(
      and(
        eq(landingPageVersions.workspaceId, workspaceId),
        eq(landingPageVersions.landingPageId, landingPageId),
      ),
    )
    .orderBy(desc(landingPageVersions.version));
}

export interface PublicLandingPage {
  id: string;
  slug: string;
  snapshot: LandingSnapshot;
  /** Produto atual do catálogo, quando a página segue sincronizada */
  liveProduct: LandingProductData | null;
}

/**
 * Página pública por slug. Só devolve conteúdo quando existe uma versão
 * publicada, a página não está pausada e o agendamento já chegou — a rota
 * pública nunca serve rascunho.
 *
 * Em `cache()` porque `generateMetadata` e a renderização chamam a mesma
 * consulta na mesma requisição.
 */
export const getPublishedLandingBySlug = cache(
  async function getPublishedLandingBySlug(
    slug: string,
  ): Promise<PublicLandingPage | null> {
    if (!isDatabaseConfigured()) return null;

    try {
      const db = getDb();
      const [row] = await db
        .select()
        .from(landingPages)
        .where(and(eq(landingPages.slug, slug), isNull(landingPages.deletedAt)))
        .limit(1);

      if (!row || !row.publishedSnapshot) return null;
      if (row.pausedAt) return null;
      if (row.status !== "published") return null;
      if (row.scheduledPublishAt && row.scheduledPublishAt > new Date()) {
        return null;
      }

      const snapshot = row.publishedSnapshot as LandingSnapshot;

      // Com sincronização ligada, preço e estoque saem do catálogo na hora
      // da visita: uma alteração de preço não pode exigir republicação.
      const liveProduct = row.productSync
        ? await resolveLandingProduct(
            {
              productId: row.productId,
              productSync: true,
              productSnapshot: row.productSnapshot,
            },
            row.workspaceId,
          )
        : null;

      return { id: row.id, slug: row.slug, snapshot, liveProduct };
    } catch (error) {
      console.error("[landing-pages] erro ao buscar página pública:", error);
      return null;
    }
  },
);

/** Rascunho servido no preview privado, autenticado pelo token da página. */
export const getLandingPreviewByToken = cache(
  async function getLandingPreviewByToken(
    slug: string,
    token: string,
  ): Promise<PublicLandingPage | null> {
    if (!isDatabaseConfigured() || !token) return null;

    try {
      const db = getDb();
      const [row] = await db
        .select()
        .from(landingPages)
        .where(and(eq(landingPages.slug, slug), isNull(landingPages.deletedAt)))
        .limit(1);

      if (!row || !row.previewToken || row.previewToken !== token) return null;

      const product = await resolveLandingProduct(
        {
          productId: row.productId,
          productSync: row.productSync,
          productSnapshot: row.productSnapshot,
        },
        row.workspaceId,
      );

      const snapshot: LandingSnapshot = {
        version: row.draftVersion,
        publicName: row.publicName ?? row.name,
        logoUrl: row.logoUrl,
        faviconUrl: row.faviconUrl,
        language: row.language,
        currency: row.currency,
        content: withContentDefaults(row.content),
        theme: withThemeDefaults(row.theme),
        seo: withSeoDefaults(row.seo),
        tracking: withTrackingDefaults(row.tracking),
        customCode: withCustomCodeDefaults(row.customCode),
        product,
        publishedAt: new Date().toISOString(),
      };

      return { id: row.id, slug: row.slug, snapshot, liveProduct: product };
    } catch (error) {
      console.error("[landing-pages] erro ao buscar preview:", error);
      return null;
    }
  },
);

export interface LandingEventPoint {
  day: string;
  views: number;
  ctaClicks: number;
  checkouts: number;
}

/** Série diária dos últimos 30 dias para o gráfico da aba Métricas. */
export async function getLandingEventSeries(
  landingPageId: string,
): Promise<LandingEventPoint[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${landingPageEvents.occurredAt}), 'YYYY-MM-DD')`,
      views: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'page_view')::int`,
      ctaClicks: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'cta_click')::int`,
      checkouts: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'initiate_checkout')::int`,
    })
    .from(landingPageEvents)
    .where(
      and(
        eq(landingPageEvents.workspaceId, workspaceId),
        eq(landingPageEvents.landingPageId, landingPageId),
        sql`${landingPageEvents.occurredAt} >= now() - interval '30 days'`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${landingPageEvents.occurredAt})`)
    .orderBy(sql`date_trunc('day', ${landingPageEvents.occurredAt})`);

  return rows;
}

export interface LandingSourceRow {
  source: string;
  visits: number;
  checkouts: number;
}

/** Origem do tráfego (utm_source) dos últimos 30 dias. */
export async function getLandingSources(
  landingPageId: string,
): Promise<LandingSourceRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  return db
    .select({
      source: sql<string>`coalesce(nullif(${landingPageEvents.source}, ''), 'direto')`,
      visits: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'page_view')::int`,
      checkouts: sql<number>`count(*) filter (where ${landingPageEvents.eventName} = 'initiate_checkout')::int`,
    })
    .from(landingPageEvents)
    .where(
      and(
        eq(landingPageEvents.workspaceId, workspaceId),
        eq(landingPageEvents.landingPageId, landingPageId),
        sql`${landingPageEvents.occurredAt} >= now() - interval '30 days'`,
      ),
    )
    .groupBy(sql`coalesce(nullif(${landingPageEvents.source}, ''), 'direto')`)
    .orderBy(sql`count(*) desc`)
    .limit(10);
}
