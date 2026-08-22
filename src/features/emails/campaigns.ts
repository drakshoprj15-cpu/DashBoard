import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { emailCampaigns, emailRecipients } from "@/database/schema";
import {
  buildCampaignHtml,
  DEFAULT_CAMPAIGN_TEMPLATE,
  type CampaignTemplateContent,
  type CampaignTemplateVars,
} from "@/features/emails/template";
import { getAppUrl } from "@/lib/app-url";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

const SENT_STATUSES = ["sent", "delivered", "opened", "clicked"];
const FAILED_STATUSES = ["failed", "bounced", "complained", "suppressed"];
const QUEUED_STATUSES = ["pending", "queued"];

export interface EmailDashboardStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
}

export interface EmailCampaignHistoryItem extends EmailDashboardStats {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  previewHtml: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
}

export interface EmailDashboardOverview {
  stats: EmailDashboardStats;
  history: EmailCampaignHistoryItem[];
}

function countFor(statuses: string[]) {
  return sql<number>`count(${emailRecipients.id}) filter (where ${inArray(emailRecipients.status, statuses)})::int`;
}

function campaignContent(content: unknown): CampaignTemplateContent {
  if (!content || typeof content !== "object") {
    return { body: "" };
  }
  const value = content as Record<string, unknown>;
  return {
    body: typeof value.body === "string" ? value.body : "",
    headerName:
      typeof value.headerText === "string" ? value.headerText : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    articleName:
      typeof value.articleName === "string" ? value.articleName : undefined,
    ctaLabel: typeof value.ctaLabel === "string" ? value.ctaLabel : undefined,
    ctaUrl: typeof value.ctaUrl === "string" ? value.ctaUrl : undefined,
    fallbackText:
      typeof value.fallbackText === "string" ? value.fallbackText : undefined,
  };
}

function previewVars(appUrl: string): CampaignTemplateVars {
  return {
    nome: "Maria Oliveira",
    primeiroNome: "Maria",
    email: "maria@exemplo.pt",
    produto: "Produto Exemplo",
    pedido: "PED-1234",
    valor: "49,90 €",
    checkoutUrl: `${appUrl.replace(/\/$/, "")}/checkout/exemplo`,
    lojaUrl: appUrl,
  };
}

export async function getEmailDashboardOverview(): Promise<EmailDashboardOverview> {
  const empty = {
    stats: { total: 0, sent: 0, failed: 0, queued: 0 },
    history: [],
  } satisfies EmailDashboardOverview;
  if (!isDatabaseConfigured()) return empty;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const appUrl = getAppUrl();
  const [statsRows, historyRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(${emailRecipients.id})::int`,
        sent: countFor(SENT_STATUSES),
        failed: countFor(FAILED_STATUSES),
        queued: countFor(QUEUED_STATUSES),
      })
      .from(emailRecipients)
      .where(eq(emailRecipients.workspaceId, workspaceId)),
    db
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        preheader: emailCampaigns.preheader,
        content: emailCampaigns.content,
        status: emailCampaigns.status,
        createdAt: emailCampaigns.createdAt,
        sentAt: emailCampaigns.sentAt,
        total: sql<number>`count(${emailRecipients.id})::int`,
        sent: countFor(SENT_STATUSES),
        failed: countFor(FAILED_STATUSES),
        queued: countFor(QUEUED_STATUSES),
      })
      .from(emailCampaigns)
      .leftJoin(
        emailRecipients,
        and(
          eq(emailRecipients.campaignId, emailCampaigns.id),
          eq(emailRecipients.workspaceId, workspaceId),
        ),
      )
      .where(eq(emailCampaigns.workspaceId, workspaceId))
      .groupBy(
        emailCampaigns.id,
        emailCampaigns.name,
        emailCampaigns.subject,
        emailCampaigns.preheader,
        emailCampaigns.content,
        emailCampaigns.status,
        emailCampaigns.createdAt,
        emailCampaigns.sentAt,
      )
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(8),
  ]);

  const stats = statsRows[0] ?? empty.stats;
  return {
    stats: {
      total: stats.total ?? 0,
      sent: stats.sent ?? 0,
      failed: stats.failed ?? 0,
      queued: stats.queued ?? 0,
    },
    history: historyRows.map((row) => {
      const content = campaignContent(row.content);
      const preheader = row.preheader ?? "";
      return {
        id: row.id,
        name: row.name,
        subject: row.subject,
        preheader,
        previewHtml: buildCampaignHtml({
          body: content.body || "O conteudo deste disparo nao esta disponivel.",
          preheader,
          headerName: content.headerName,
          title: content.title ?? DEFAULT_CAMPAIGN_TEMPLATE.title,
          articleName:
            content.articleName ?? DEFAULT_CAMPAIGN_TEMPLATE.articleName,
          ctaLabel: content.ctaLabel ?? DEFAULT_CAMPAIGN_TEMPLATE.ctaLabel,
          ctaUrl: content.ctaUrl ?? DEFAULT_CAMPAIGN_TEMPLATE.ctaUrl,
          fallbackText:
            content.fallbackText ?? DEFAULT_CAMPAIGN_TEMPLATE.fallbackText,
          vars: previewVars(appUrl),
        }),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        total: row.total ?? 0,
        sent: row.sent ?? 0,
        failed: row.failed ?? 0,
        queued: row.queued ?? 0,
      };
    }),
  };
}

export async function refreshCampaignStats(campaignId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      total: sql<number>`count(${emailRecipients.id})::int`,
      sent: countFor(SENT_STATUSES),
      failed: countFor(FAILED_STATUSES),
      queued: countFor(QUEUED_STATUSES),
    })
    .from(emailRecipients)
    .where(eq(emailRecipients.campaignId, campaignId));

  const stats: EmailDashboardStats = {
    total: row?.total ?? 0,
    sent: row?.sent ?? 0,
    failed: row?.failed ?? 0,
    queued: row?.queued ?? 0,
  };
  await db
    .update(emailCampaigns)
    .set({ stats, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));
  return stats;
}
