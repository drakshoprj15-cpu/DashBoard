import { NextResponse } from "next/server";

import {
  recordTrackEvent,
  TRACK_EVENTS,
  type TrackEvent,
} from "@/features/analytics/track";
import { ATTRIBUTION_COOKIE } from "@/features/attribution/utm";

export const dynamic = "force-dynamic";

/**
 * Endpoint público de rastreamento (chamado pelo navegador nas páginas da
 * loja). Pública por necessidade: quem chama é o visitante, não o painel.
 *
 * Protegido por: lista fechada de eventos, limites de tamanho, e nenhum dado
 * sensível gravado (IP mascarado, sessão anônima).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      anonymousId?: string;
      event?: string;
      page?: string;
      referrer?: string;
      utm?: Record<string, string>;
      productSlug?: string;
      valueCents?: number;
      currency?: string;
    } | null;

    if (!body?.anonymousId || !body?.event) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!TRACK_EVENTS.includes(body.event as TrackEvent)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (body.anonymousId.length > 64) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const h = request.headers;
    await recordTrackEvent(
      {
        anonymousId: body.anonymousId,
        event: body.event as TrackEvent,
        page: body.page?.slice(0, 512),
        referrer: body.referrer?.slice(0, 512),
        utm: body.utm,
        productSlug: body.productSlug?.slice(0, 128),
        valueCents: body.valueCents,
        currency: body.currency?.slice(0, 8),
      },
      {
        userAgent: h.get("user-agent"),
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        country: h.get("x-vercel-ip-country"),
        city: h.get("x-vercel-ip-city")
          ? decodeURIComponent(h.get("x-vercel-ip-city")!)
          : null,
      },
    );

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ATTRIBUTION_COOKIE, body.anonymousId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
    return response;
  } catch (error) {
    // Rastreamento nunca pode quebrar a experiência do visitante.
    console.error("[track] erro:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
