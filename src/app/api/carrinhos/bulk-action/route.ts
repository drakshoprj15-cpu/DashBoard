import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/database/client";
import {
  archiveCartsAction,
  bulkSendReminderAction,
  markCartStatusAction,
} from "@/features/carts/actions";
import { MAX_BULK_ORDERS } from "@/features/carts/limits";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum([
    "send_email",
    "mark_recovered",
    "mark_refused",
    "mark_pending",
    "archive",
    "unarchive",
  ]),
  orderIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_ORDERS),
  template: z.enum(["pending", "abandoned", "declined"]).optional(),
});

const MARK_BY_ACTION = {
  mark_recovered: "recovered",
  mark_refused: "refused",
  mark_pending: "pending",
} as const;

/** Ações em massa da central de recuperação — delega às server actions. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  const { action, orderIds, template } = parsed.data;

  if (action === "send_email") {
    const result = await bulkSendReminderAction(orderIds, template);
    return NextResponse.json(result);
  }

  if (action === "archive" || action === "unarchive") {
    const result = await archiveCartsAction(orderIds, action === "archive");
    return NextResponse.json(result.ok ? result : { ...result, sent: 0 }, {
      status: result.ok ? 200 : 400,
    });
  }

  // Marcações de status são por pedido — cada uma tem as suas próprias regras
  // de transição, então percorremos em vez de fazer um UPDATE em bloco.
  const mark = MARK_BY_ACTION[action];
  let updated = 0;
  const errors: string[] = [];

  for (const orderId of orderIds) {
    const result = await markCartStatusAction(orderId, mark);
    if (result.ok) updated += 1;
    else if (result.error) errors.push(result.error);
  }

  return NextResponse.json({
    ok: updated > 0,
    updated,
    skipped: orderIds.length - updated,
    errors: Array.from(new Set(errors)).slice(0, 5),
  });
}
