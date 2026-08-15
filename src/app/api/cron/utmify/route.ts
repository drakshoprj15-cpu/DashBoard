import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { processUtmifyOutbox } from "@/features/pixels/utmify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !header) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const processed = await processUtmifyOutbox();
  return NextResponse.json({ ok: true, processed });
}
