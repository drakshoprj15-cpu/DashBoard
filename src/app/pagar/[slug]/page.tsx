import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Ban, Clock, CheckCircle2 } from "lucide-react";

import {
  countPaidPayments,
  getPaymentLinkBySlug,
  toPublicPaymentLink,
} from "@/features/payment-links/queries";
import { resolveLinkState } from "@/features/payment-links/types";
import { PublicCheckout } from "@/features/payment-links/public-checkout";
import { PixelScripts } from "@/features/pixels/pixel-scripts";
import { isPanelHost, normalizeHost } from "@/lib/hosts";

/**
 * Página pública de um link de pagamento.
 *
 * Server component: o link é lido do banco a cada visita, e só o recorte
 * público (`toPublicPaymentLink`) chega ao navegador — nada de workspace,
 * credenciais do gateway ou campos administrativos.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/pagar/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const record = await getPaymentLinkBySlug(slug);
  const publicLink = record ? toPublicPaymentLink(record) : null;

  return {
    title: publicLink?.seo.browserTitle || record?.title || "Pagamento",
    description:
      publicLink?.seo.description || record?.description || undefined,
    icons: publicLink?.seo.faviconUrl
      ? { icon: publicLink.seo.faviconUrl }
      : undefined,
    // Uma página de cobrança pessoal não deve aparecer em buscadores.
    robots: { index: false, follow: false },
  };
}

/** Tela de link indisponível — elegante, nunca um erro cru. */
function UnavailableScreen({
  variant,
  customTitle,
  customBody,
}: {
  variant: "expired" | "disabled" | "exhausted";
  customTitle?: string;
  customBody?: string;
}) {
  const content = {
    expired: {
      Icon: Clock,
      tone: "bg-amber-100 text-amber-600",
      title: "Este link de pagamento expirou",
      body: "O prazo para pagar terminou. Peça um novo link a quem lhe enviou este.",
    },
    disabled: {
      Icon: Ban,
      tone: "bg-zinc-200 text-zinc-500",
      title: "Este link já não está disponível",
      body: "A cobrança foi desativada por quem a criou.",
    },
    exhausted: {
      Icon: CheckCircle2,
      tone: "bg-emerald-100 text-emerald-600",
      title: "Pagamento já realizado",
      body: "Esta cobrança já foi paga e não aceita novos pagamentos.",
    },
  }[variant];

  const { Icon } = content;
  const title = customTitle || content.title;
  const body = customBody || content.body;

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#F6F7F9] px-4 py-10">
      <div className="w-full max-w-[440px] rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div
          className={`mx-auto flex size-12 items-center justify-center rounded-full ${content.tone}`}
        >
          <Icon className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{body}</p>
      </div>
    </main>
  );
}

export default async function PagarPage(props: PageProps<"/pagar/[slug]">) {
  const { slug } = await props.params;

  const record = await getPaymentLinkBySlug(slug);
  if (!record) notFound();

  const requestHost = normalizeHost((await headers()).get("host"));
  if (record.domainHostname && requestHost !== record.domainHostname) {
    redirect(`https://${record.domainHostname}/pagar/${record.slug}`);
  }
  if (!record.domainHostname && !isPanelHost(requestHost)) notFound();

  const paidCount = await countPaidPayments(record.id);
  const link = toPublicPaymentLink(record);
  const state = resolveLinkState({
    isActive: record.isActive,
    status: record.status,
    archivedAt: record.archivedAt,
    expiresAt: record.expiresAt,
    maxPayments: record.maxPayments,
    paidCount,
  });

  if (state === "expired") {
    return (
      <UnavailableScreen
        variant="expired"
        customTitle={link.success.expiredTitle}
        customBody={link.success.expiredDescription}
      />
    );
  }
  if (state === "exhausted") return <UnavailableScreen variant="exhausted" />;
  if (state !== "active") return <UnavailableScreen variant="disabled" />;

  return (
    <main>
      {/*
        ViewContent no acesso. O Purchase NÃO sai daqui — é enviado pelo
        webhook, com o valor realmente confirmado pelo gateway.
      */}
      {record.metaPixelEnabled ? (
        <PixelScripts
          workspaceId={record.workspaceId}
          target={{ type: "payment_link", id: record.id }}
          landingPageId={null}
          event="ViewContent"
          content={{
            id: record.slug,
            name: record.title,
            valueCents: record.amountCents,
            currency: record.currency,
          }}
        />
      ) : null}
      <PublicCheckout link={link} trackingEnabled={record.metaPixelEnabled} />
    </main>
  );
}
