import { NextResponse } from "next/server";

import {
  checkRateLimit,
  recordLandingEvent,
} from "@/features/landing-pages/events";
import { landingEventSchema } from "@/validations/landing-page";

export const dynamic = "force-dynamic";

/**
 * Eventos das landing pages públicas (visita, clique no botão, ida ao
 * checkout).
 *
 * Aberta por necessidade — quem chama é o navegador do visitante. As
 * proteções são: lista fechada de eventos (Zod), id de página validado
 * contra o banco, limite de taxa por IP e nenhum dado pessoal no corpo.
 */
export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sem-ip";

    if (!checkRateLimit(ip)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const parsed = landingEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const recorded = await recordLandingEvent(parsed.data, {
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: recorded }, { status: recorded ? 200 : 404 });
  } catch (error) {
    // Rastreamento nunca pode quebrar a página do visitante.
    console.error("[lp-events] erro:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
