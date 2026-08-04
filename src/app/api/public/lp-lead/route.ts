import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customerActivities, customers, landingPages } from "@/database/schema";
import {
  normalizeEmail,
  normalizePhone,
} from "@/features/customers/customer-utils";
import { checkRateLimit } from "@/features/landing-pages/events";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  pageId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  name: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  /** Consentimento explícito — sem ele nada é gravado (RGPD) */
  consent: z.literal(true),
});

/**
 * Recebe os contactos deixados no bloco "Formulário" de uma landing page e
 * grava-os em Clientes, com a origem registada nas etiquetas.
 *
 * Só grava com consentimento explícito. Não aceita nem guarda documento,
 * cartão ou qualquer dado sensível — o formulário público pede, no máximo,
 * nome, e-mail e telefone.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Serviço indisponível." },
      { status: 503 },
    );
  }

  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sem-ip";

    if (!checkRateLimit(`lead:${ip}`)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Demasiados envios. Tente novamente daqui a pouco.",
        },
        { status: 429 },
      );
    }

    const parsed = leadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { pageId, email, name, phone } = parsed.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = phone ? normalizePhone(phone) : null;
    if (!normalizedEmail || (phone && !normalizedPhone)) {
      return NextResponse.json(
        { ok: false, error: "E-mail ou telefone inválido." },
        { status: 400 },
      );
    }
    const db = getDb();

    const [page] = await db
      .select({
        workspaceId: landingPages.workspaceId,
        slug: landingPages.slug,
      })
      .from(landingPages)
      .where(and(eq(landingPages.id, pageId), isNull(landingPages.deletedAt)))
      .limit(1);

    if (!page) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const [firstName, ...restName] = name.split(" ").filter(Boolean);

    const now = new Date();
    const [customer] = await db
      .insert(customers)
      .values({
        workspaceId: page.workspaceId,
        email: normalizedEmail,
        normalizedEmail,
        emailStatus: "valid",
        firstName: firstName ?? null,
        lastName: restName.join(" ") || null,
        phone: phone || null,
        normalizedPhone,
        tags: ["landing-page", page.slug],
        source: "landing_page",
        firstSource: "landing_page",
        firstLandingPageId: pageId,
        lastLandingPageId: pageId,
        acceptsEmail: true,
        marketingOptOut: false,
        firstSeenAt: now,
        lastActivityAt: now,
      })
      .onConflictDoUpdate({
        target: [customers.workspaceId, customers.email],
        set: {
          ...(firstName ? { firstName } : {}),
          ...(phone ? { phone, normalizedPhone } : {}),
          normalizedEmail,
          emailStatus: "valid",
          lastLandingPageId: pageId,
          lastActivityAt: now,
          acceptsEmail: true,
          marketingOptOut: false,
          updatedAt: now,
        },
      })
      .returning({ id: customers.id });

    if (customer) {
      await db.insert(customerActivities).values({
        workspaceId: page.workspaceId,
        customerId: customer.id,
        type: "landing_page_lead",
        source: "landing_page",
        referenceType: "landing_page",
        referenceId: pageId,
        metadata: { slug: page.slug },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[lp-lead] erro:", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível enviar agora." },
      { status: 500 },
    );
  }
}
