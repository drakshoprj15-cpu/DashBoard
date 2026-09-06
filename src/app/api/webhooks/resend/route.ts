import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  emailEvents,
  emailRecipients,
  emailSuppressions,
} from "@/database/schema";
import { refreshCampaignStats } from "@/features/emails/campaigns";
import {
  isResendWebhookConfigured,
  verifyResendWebhook,
} from "@/features/emails/resend-provider";
import { suppressionReasonForResendEvent } from "@/features/emails/suppression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPE = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
} as const;

const STATUS_BY_EVENT: Record<string, string> = {
  "email.scheduled": "queued",
  "email.delivery_delayed": "queued",
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
};

const TERMINAL_STATUSES = new Set([
  "failed",
  "bounced",
  "complained",
  "suppressed",
]);

function transitionStatus(current: string, next: string): string {
  if (TERMINAL_STATUSES.has(current)) return current;
  if (TERMINAL_STATUSES.has(next)) return next;
  return (STATUS_RANK[next] ?? 0) >= (STATUS_RANK[current] ?? 0)
    ? next
    : current;
}

function eventMetadata(event: { type: string; data: Record<string, unknown> }) {
  const metadata: Record<string, unknown> = { providerType: event.type };
  if ("failed" in event.data) metadata.failed = event.data.failed;
  if ("bounce" in event.data) metadata.bounce = event.data.bounce;
  if ("click" in event.data) metadata.click = event.data.click;
  if ("suppressed" in event.data) metadata.suppressed = event.data.suppressed;
  return metadata;
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured() || !isResendWebhookConfigured()) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 503 },
    );
  }

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  try {
    const payload = await request.text();
    const event = verifyResendWebhook(payload, { id, timestamp, signature });
    if (!event.type.startsWith("email.") || !("email_id" in event.data)) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const db = getDb();
    const emailId = String(event.data.email_id);
    const [recipient] = await db
      .select()
      .from(emailRecipients)
      .where(eq(emailRecipients.externalId, emailId))
      .limit(1);
    if (!recipient) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const mappedType = EVENT_TYPE[event.type as keyof typeof EVENT_TYPE];
    if (mappedType) {
      const [inserted] = await db
        .insert(emailEvents)
        .values({
          workspaceId: recipient.workspaceId,
          recipientId: recipient.id,
          campaignId: recipient.campaignId,
          type: mappedType,
          externalEventId: id,
          metadata: eventMetadata({
            type: event.type,
            data: event.data as unknown as Record<string, unknown>,
          }),
          occurredAt: new Date(event.created_at),
        })
        .onConflictDoNothing()
        .returning({ id: emailEvents.id });
      if (!inserted) {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    const next = STATUS_BY_EVENT[event.type];
    if (next) {
      await db
        .update(emailRecipients)
        .set({
          status: transitionStatus(recipient.status, next),
          sentAt:
            recipient.sentAt ??
            (event.type === "email.sent" ? new Date(event.created_at) : null),
          updatedAt: new Date(),
        })
        .where(eq(emailRecipients.id, recipient.id));
    }

    const suppressionReason = suppressionReasonForResendEvent(
      event.type,
      event.data as unknown as Record<string, unknown>,
    );
    if (suppressionReason) {
      await db
        .insert(emailSuppressions)
        .values({
          workspaceId: recipient.workspaceId,
          email: recipient.email.toLowerCase(),
          reason: suppressionReason,
        })
        .onConflictDoUpdate({
          target: [emailSuppressions.workspaceId, emailSuppressions.email],
          set: { reason: suppressionReason, updatedAt: new Date() },
        });
    }

    await refreshCampaignStats(recipient.campaignId);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook do Resend rejeitado", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });
  }
}
