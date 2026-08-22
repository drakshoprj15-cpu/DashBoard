"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  emailCampaigns,
  emailEvents,
  emailRecipients,
} from "@/database/schema";
import { refreshCampaignStats } from "@/features/emails/campaigns";
import {
  getCustomRecipients,
  getSegmentRecipients,
  type Recipient,
} from "@/features/emails/segments";
import { splitProviderBatches } from "@/features/emails/batching";
import type { SegmentKey } from "@/features/emails/types";
import {
  isResendConfigured,
  MAX_EMAILS_PER_BATCH,
  sendEmail,
  sendEmailBatch,
  testResendConnection,
} from "@/features/emails/resend-provider";
import {
  buildCampaignHtml,
  isValidCtaUrlTemplate,
  renderCampaignText,
  type CampaignTemplateVars,
} from "@/features/emails/template";
import { getEmailBrand } from "@/features/emails/brand";
import { company } from "@/lib/company";
import { getAppUrl } from "@/lib/app-url";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

const RESEND_BATCH_INTERVAL_MS = 250;

const campaignSchema = z.object({
  dispatchId: z.string().uuid(),
  segment: z.enum(["paid", "pending", "refused", "no_orders", "all", "custom"]),
  customerIds: z.string().trim().optional().or(z.literal("")),
  subject: z.string().trim().min(3, "Escreva um assunto").max(160),
  preheader: z.string().trim().max(180).optional().or(z.literal("")),
  headerName: z.string().trim().max(80).optional().or(z.literal("")),
  title: z.string().trim().min(3, "Escreva o titulo do e-mail").max(160),
  articleName: z.string().trim().min(2, "Escreva o nome do artigo").max(160),
  body: z.string().trim().min(10, "Escreva a mensagem").max(10_000),
  ctaLabel: z.string().trim().min(2, "Escreva o texto do botao").max(80),
  ctaUrl: z
    .string()
    .trim()
    .min(1, "Informe o link do botao")
    .max(2_048)
    .refine(
      isValidCtaUrlTemplate,
      "Use um link http(s) valido ou {{CHECKOUT_URL}}.",
    ),
  fallbackText: z
    .string()
    .trim()
    .min(3, "Escreva o texto do link alternativo")
    .max(240),
  testEmail: z
    .string()
    .trim()
    .email("E-mail de teste inválido")
    .optional()
    .or(z.literal("")),
  mode: z.enum(["test", "send"]),
});

async function resolveRecipients(
  segment: SegmentKey,
  customerIdsRaw: string | undefined,
): Promise<Recipient[]> {
  const recipients =
    segment === "custom"
      ? (
          await getCustomRecipients(
            (customerIdsRaw ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          )
        ).recipients
      : await getSegmentRecipients(segment);

  const unique = new Map<string, Recipient>();
  for (const recipient of recipients) {
    const key = recipient.email.trim().toLowerCase();
    if (key && !unique.has(key)) unique.set(key, recipient);
  }
  return Array.from(unique.values());
}

export interface EmailActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  campaignId?: string;
  total?: number;
  sent?: number;
  failed?: number;
  queued?: number;
}

function waitForNextProviderBatch() {
  return new Promise((resolve) =>
    setTimeout(resolve, RESEND_BATCH_INTERVAL_MS),
  );
}

function templateVars(
  recipient: Recipient,
  appUrl: string,
): CampaignTemplateVars {
  const primeiroNome = recipient.name.trim().split(/\s+/)[0] || "Cliente";
  return {
    nome: recipient.name,
    primeiroNome,
    email: recipient.email,
    produto: recipient.productName ?? "o seu produto",
    pedido: recipient.orderReference ?? "o seu pedido",
    valor:
      recipient.orderTotalCents === null
        ? ""
        : formatMoney(
            recipient.orderTotalCents,
            recipient.currency ?? "EUR",
            "pt-PT",
          ),
    checkoutUrl: recipient.checkoutUrl ?? appUrl,
    lojaUrl: appUrl,
  };
}

function sampleVars(email: string, appUrl: string): CampaignTemplateVars {
  return {
    nome: "Cliente Exemplo",
    primeiroNome: "Cliente",
    email,
    produto: "Produto Exemplo",
    pedido: "PED-1234",
    valor: "49,90 €",
    checkoutUrl: `${appUrl.replace(/\/$/, "")}/checkout/exemplo`,
    lojaUrl: appUrl,
  };
}

async function duplicateCampaignResult(
  campaignId: string,
): Promise<EmailActionResult> {
  const stats = await refreshCampaignStats(campaignId);
  return {
    ok: stats.sent > 0 && stats.failed === 0,
    campaignId,
    ...stats,
    message:
      stats.sent > 0
        ? "Este disparo já foi processado. Nenhum e-mail foi duplicado."
        : undefined,
    error:
      stats.sent === 0
        ? "Este disparo já está em processamento ou falhou. Consulte o histórico."
        : undefined,
  };
}

export async function sendCampaignAction(
  _prev: EmailActionResult | null,
  formData: FormData,
): Promise<EmailActionResult> {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, error: "Não autenticado." };
  }

  const parsed = campaignSchema.safeParse({
    dispatchId: formData.get("dispatchId"),
    segment: formData.get("segment"),
    customerIds: formData.get("customerIds") ?? "",
    subject: formData.get("subject"),
    preheader: formData.get("preheader") ?? "",
    headerName: formData.get("headerName") ?? "",
    title: formData.get("title"),
    articleName: formData.get("articleName"),
    body: formData.get("body"),
    ctaLabel: formData.get("ctaLabel"),
    ctaUrl: formData.get("ctaUrl"),
    fallbackText: formData.get("fallbackText"),
    testEmail: formData.get("testEmail") ?? "",
    mode: formData.get("mode"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (!isResendConfigured()) {
    return {
      ok: false,
      error:
        "O envio ainda não está ativo. Configure RESEND_API_KEY e RESEND_FROM_EMAIL na Vercel.",
    };
  }

  const {
    dispatchId,
    segment,
    customerIds,
    subject,
    preheader,
    headerName,
    title,
    articleName,
    body,
    ctaLabel,
    ctaUrl,
    fallbackText,
    testEmail,
    mode,
  } = parsed.data;
  const appUrl = getAppUrl();
  const brand = await getEmailBrand();

  if (mode === "test") {
    if (!testEmail) {
      return { ok: false, error: "Informe o e-mail para receber o teste." };
    }
    const vars = sampleVars(testEmail, appUrl);
    const result = await sendEmail({
      to: testEmail,
      subject: `[TESTE] ${renderCampaignText(subject, vars)}`,
      html: buildCampaignHtml({
        body,
        preheader,
        headerName,
        title,
        articleName,
        ctaLabel,
        ctaUrl,
        fallbackText,
        vars,
        brand,
      }),
      replyTo: company.email,
      idempotencyKey: `test/${dispatchId}`,
    });
    return result.ok
      ? { ok: true, message: `E-mail de teste enviado para ${testEmail}.` }
      : { ok: false, error: result.error };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  const recipients = await resolveRecipients(segment, customerIds);
  if (recipients.length === 0) {
    return {
      ok: false,
      error: "Este recorte não tem destinatários elegíveis.",
    };
  }
  const providerBatches = splitProviderBatches(
    recipients,
    MAX_EMAILS_PER_BATCH,
  );

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const [created] = await db
    .insert(emailCampaigns)
    .values({
      id: dispatchId,
      workspaceId,
      name: subject.slice(0, 120),
      subject,
      preheader: preheader || null,
      fromEmail: process.env.RESEND_FROM_EMAIL,
      replyTo: company.email,
      content: {
        body,
        headerName,
        title,
        articleName,
        ctaLabel,
        ctaUrl,
        fallbackText,
      },
      audienceFilter: { segment, customerIds: customerIds || null },
      status: "sending",
      stats: {
        total: recipients.length,
        sent: 0,
        failed: 0,
        queued: recipients.length,
      },
    })
    .onConflictDoNothing()
    .returning({ id: emailCampaigns.id });

  if (!created) return duplicateCampaignResult(dispatchId);

  await db.insert(emailRecipients).values(
    recipients.map((recipient) => ({
      workspaceId,
      campaignId: dispatchId,
      customerId: recipient.id,
      email: recipient.email,
      status: "queued",
    })),
  );

  let queued = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [providerBatchIndex, chunk] of providerBatches.entries()) {
    const result = await sendEmailBatch(
      chunk.map((recipient) => {
        const vars = templateVars(recipient, appUrl);
        return {
          to: recipient.email,
          subject: renderCampaignText(subject, vars),
          html: buildCampaignHtml({
            body,
            preheader,
            headerName,
            title,
            articleName,
            ctaLabel,
            ctaUrl,
            fallbackText,
            vars,
            brand,
          }),
          replyTo: company.email,
        };
      }),
      `campaign/${dispatchId}/${providerBatchIndex}`,
    );

    if (result.ok && result.externalIds?.length === chunk.length) {
      const now = new Date();
      await db
        .insert(emailRecipients)
        .values(
          chunk.map((recipient, index) => ({
            workspaceId,
            campaignId: dispatchId,
            customerId: recipient.id,
            email: recipient.email,
            externalId: result.externalIds![index],
            status: "queued",
          })),
        )
        .onConflictDoUpdate({
          target: [emailRecipients.campaignId, emailRecipients.email],
          set: {
            externalId: sql`excluded.external_id`,
            status: "queued",
            updatedAt: now,
          },
        });
      queued += chunk.length;
      await waitForNextProviderBatch();
      continue;
    }

    const error = result.error ?? "O Resend não confirmou o envio.";
    errors.push(error);
    failed += chunk.length;
    const emails = chunk.map((recipient) => recipient.email);
    await db
      .update(emailRecipients)
      .set({ status: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(emailRecipients.campaignId, dispatchId),
          inArray(emailRecipients.email, emails),
        ),
      );

    const failedRecipients = await db
      .select({ id: emailRecipients.id })
      .from(emailRecipients)
      .where(
        and(
          eq(emailRecipients.campaignId, dispatchId),
          inArray(emailRecipients.email, emails),
        ),
      );
    if (failedRecipients.length > 0) {
      await db.insert(emailEvents).values(
        failedRecipients.map((recipient) => ({
          workspaceId,
          recipientId: recipient.id,
          campaignId: dispatchId,
          type: "failed" as const,
          externalEventId: `local:${dispatchId}:${recipient.id}`,
          metadata: { error: error.slice(0, 500) },
        })),
      );
    }
    await waitForNextProviderBatch();
  }

  const now = new Date();
  await db
    .update(emailCampaigns)
    .set({
      status: "sent",
      sentAt: now,
      stats: {
        total: recipients.length,
        sent: 0,
        failed,
        queued,
        errors: errors.slice(0, 5),
      },
      updatedAt: now,
    })
    .where(eq(emailCampaigns.id, dispatchId));

  revalidatePath("/emails");
  if (failed > 0) {
    console.error("Falha parcial no disparo de e-mail", {
      campaignId: dispatchId,
      queued,
      failed,
      errors: errors.slice(0, 3),
    });
  }

  return {
    ok: failed === 0,
    campaignId: dispatchId,
    total: recipients.length,
    sent: 0,
    failed,
    queued,
    message:
      failed === 0
        ? `Disparo colocado na fila do Resend para ${queued} ${queued === 1 ? "cliente" : "clientes"}.`
        : undefined,
    error:
      failed > 0
        ? `Em fila ${queued}; falharam ${failed}. Consulte o histórico para acompanhar.`
        : undefined,
  };
}

export async function testResendAction() {
  const session = await getSession();
  if (!session || session.demoMode) {
    return { ok: false, message: "Não autenticado." };
  }
  return testResendConnection();
}
