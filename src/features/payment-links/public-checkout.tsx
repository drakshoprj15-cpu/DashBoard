"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  Landmark,
  Loader2,
  Smartphone,
  XCircle,
} from "lucide-react";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CheckoutCard,
  EMPTY_FORM,
  type CheckoutFormValues,
} from "@/features/payment-links/checkout-card";
import {
  submitPaymentLinkCheckoutAction,
  trackPaymentLinkFormStartedAction,
  trackPaymentLinkViewAction,
} from "@/features/payment-links/checkout-actions";
import type { PublicPaymentLink } from "@/features/payment-links/types";

/**
 * Página de cobrança do lado do comprador.
 *
 * O formulário é o mesmo componente do preview do painel; o que vive aqui é
 * o que só existe em produção: envio ao servidor, acompanhamento do estado
 * e as telas de desfecho.
 *
 * Regra que não se dobra: "pago" só aparece quando o servidor devolve `paid`
 * — e o servidor só devolve isso depois do webhook do gateway. A resposta de
 * criação da cobrança nunca é tratada como confirmação.
 */

type PaymentState =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

interface CreatedPayment {
  method: "mbway" | "multibanco";
  orderId: string;
  reference: string;
  totalCents: number;
  currency: string;
  mbwayPhone?: string;
  multibanco?: {
    entity: string;
    reference: string;
    amountCents: number;
    expiresAt?: string;
  };
}

/** Intervalo entre consultas de estado — suave o suficiente para rede móvel. */
const POLL_INTERVAL_MS = 4000;
/** Deixa de consultar após 30 minutos sem desfecho. */
const POLL_TIMEOUT_MS = 30 * 60_000;

function StatusShell({
  tone,
  icon,
  title,
  children,
  radius,
}: {
  tone: "success" | "pending" | "error";
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  radius: number;
}) {
  const toneClass = {
    success: "bg-emerald-100 text-emerald-600",
    pending: "bg-amber-100 text-amber-600",
    error: "bg-red-100 text-red-600",
  }[tone];

  return (
    <div
      className="border bg-white p-6 text-center shadow-sm sm:p-8"
      style={{ borderRadius: radius }}
    >
      <div
        className={cn(
          "mx-auto flex size-12 items-center justify-center rounded-full",
          toneClass,
        )}
      >
        {icon}
      </div>
      <h1 className="mt-4 text-lg font-semibold text-zinc-900">{title}</h1>
      {children}
    </div>
  );
}

export function PublicCheckout({
  link,
  trackingEnabled = false,
}: {
  link: PublicPaymentLink;
  trackingEnabled?: boolean;
}) {
  const [values, setValues] = React.useState<CheckoutFormValues>({
    ...EMPTY_FORM,
    method: link.paymentMethods[0] ?? "mbway",
    shippingOptionId: link.fields.shippingOptions[0]?.id ?? "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CreatedPayment | null>(null);
  const [state, setState] = React.useState<PaymentState>("pending");
  const [copied, setCopied] = React.useState<"entity" | "reference" | null>(
    null,
  );
  const formStarted = React.useRef(false);
  const visitorKey = React.useRef<string | null>(null);
  const attemptId = React.useRef<string | null>(null);

  const money = (cents: number) => formatMoney(cents, link.currency, "pt-PT");
  const radius = link.appearance.cardRadius;

  // Visita: registada uma vez por carregamento da página.
  React.useEffect(() => {
    const storageKey = `infinity:payment-link:visitor:${link.slug}`;
    let key = window.sessionStorage.getItem(storageKey);
    if (!key) {
      key = crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, key);
    }
    visitorKey.current = key;
    void trackPaymentLinkViewAction(link.slug, key);
  }, [link.slug]);

  // Acompanhamento do estado real. Para assim que houver desfecho — não fica
  // a consultar para sempre um pagamento que já falhou ou expirou.
  React.useEffect(() => {
    if (!created) return;
    if (state === "paid" || state === "failed" || state === "expired") return;

    const startedAt = Date.now();
    let cancelled = false;

    const timer = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const response = await fetch(
          `/api/public/pagamento/${created.orderId}`,
          {
            cache: "no-store",
          },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { state?: PaymentState };
        if (data.state && !cancelled) setState(data.state);
      } catch {
        // Rede instável no telemóvel: a próxima tentativa resolve.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [created, state]);

  async function handleSubmit(form: CheckoutFormValues) {
    setSubmitting(true);
    setError(null);
    setErrorField(null);

    try {
      const result = await submitPaymentLinkCheckoutAction({
        slug: link.slug,
        attemptId:
          attemptId.current ?? (attemptId.current = crypto.randomUUID()),
        method: form.method,
        name: form.name,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        document: form.document,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        postalCode: form.postalCode,
        city: form.city,
        region: form.region,
        country: form.country,
        shippingOptionId: form.shippingOptionId,
      });

      if (result.status === "payment_created") {
        setCreated(result);
        setState("pending");
        return;
      }
      if (result.status === "validation_error") {
        setError(result.error);
        setErrorField(result.field ?? null);
        return;
      }
      if (result.status === "link_unavailable") {
        setError(result.message);
        return;
      }
      setError(result.error);
    } catch {
      setError(
        "Não foi possível iniciar o pagamento. Nenhum valor foi cobrado — tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyReference(text: string, field: "entity" | "reference") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  function retry() {
    setCreated(null);
    setState("pending");
    setError(null);
    attemptId.current = crypto.randomUUID();
  }

  if (created) {
    const pageBackground =
      link.appearance.backgroundType === "gradient"
        ? `linear-gradient(${link.appearance.gradientAngle}deg, ${link.appearance.gradientFrom}, ${link.appearance.gradientTo})`
        : link.appearance.backgroundColor;
    return (
      <div className="min-h-svh" style={{ background: pageBackground }}>
        <div
          className="mx-auto w-full px-4 py-10 sm:py-14"
          style={{ maxWidth: link.appearance.cardWidth + 32 }}
        >
          {link.brand.logoUrl || link.brand.companyName ? (
            <div
              className={cn(
                "mb-6 flex flex-col",
                link.brand.logoAlignment === "left" && "items-start text-left",
                link.brand.logoAlignment === "center" &&
                  "items-center text-center",
                link.brand.logoAlignment === "right" && "items-end text-right",
              )}
            >
              {link.brand.logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={link.brand.logoUrl}
                    alt={link.brand.companyName || "Logo da empresa"}
                    className="object-contain"
                    style={{
                      width: link.brand.logoWidth,
                      height: link.brand.logoHeight,
                      maxWidth: "100%",
                    }}
                  />
                </>
              ) : (
                <p
                  className="font-semibold"
                  style={{ color: link.appearance.titleColor }}
                >
                  {link.brand.companyName}
                </p>
              )}
            </div>
          ) : null}

          {state === "paid" ? (
            <StatusShell
              radius={radius}
              tone="success"
              title={link.success.title}
              icon={<CheckCircle2 className="size-6" />}
            >
              <p className="mt-1.5 text-sm text-zinc-500">
                Recebemos o seu pagamento de {money(created.totalCents)}.
              </p>
              {link.success.description ? (
                <p className="mt-2 text-sm text-zinc-500">
                  {link.success.description}
                </p>
              ) : null}
              <p className="mt-4 text-xs text-zinc-400">
                Referência {created.reference}
              </p>
              {link.success.redirectUrl ? (
                <a
                  href={link.success.redirectUrl}
                  className="mt-5 flex w-full items-center justify-center px-4 text-sm font-semibold transition-colors duration-200 hover:bg-[var(--button-hover)]"
                  style={{
                    height: link.appearance.buttonHeight,
                    backgroundColor: link.appearance.buttonColor,
                    color: link.appearance.buttonTextColor,
                    borderRadius: link.appearance.buttonRadius,
                    ["--button-hover" as string]:
                      link.appearance.buttonHoverColor,
                  }}
                >
                  {link.success.buttonText}
                </a>
              ) : null}
            </StatusShell>
          ) : state === "failed" ? (
            <StatusShell
              radius={radius}
              tone="error"
              title="Não foi possível concluir o pagamento"
              icon={<XCircle className="size-6" />}
            >
              <p className="mt-1.5 text-sm text-zinc-500">
                Nenhum valor foi cobrado. Pode tentar de novo.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-5 w-full px-4 py-3 text-sm font-semibold transition-opacity duration-150 hover:opacity-90"
                style={{
                  backgroundColor: link.appearance.secondaryButtonBackground,
                  color: link.appearance.secondaryButtonColor,
                  border: `1px solid ${link.appearance.secondaryButtonBorderColor}`,
                  borderRadius: link.appearance.buttonRadius,
                }}
              >
                {link.appearance.secondaryButtonText}
              </button>
            </StatusShell>
          ) : state === "expired" ? (
            <StatusShell
              radius={radius}
              tone="error"
              title="Este pagamento expirou"
              icon={<Clock className="size-6" />}
            >
              <p className="mt-1.5 text-sm text-zinc-500">
                O prazo de confirmação terminou. Nenhum valor foi cobrado.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-5 w-full px-4 py-3 text-sm font-semibold transition-opacity duration-150 hover:opacity-90"
                style={{
                  backgroundColor: link.appearance.secondaryButtonBackground,
                  color: link.appearance.secondaryButtonColor,
                  border: `1px solid ${link.appearance.secondaryButtonBorderColor}`,
                  borderRadius: link.appearance.buttonRadius,
                }}
              >
                {link.appearance.secondaryButtonText}
              </button>
            </StatusShell>
          ) : created.method === "mbway" ? (
            <StatusShell
              radius={radius}
              tone="pending"
              title="Confirme na aplicação MB WAY"
              icon={<Smartphone className="size-6" />}
            >
              <p className="mt-1.5 text-sm text-zinc-500">
                Enviámos um pedido de {money(created.totalCents)} para{" "}
                <strong className="text-zinc-700">{created.mbwayPhone}</strong>.
              </p>
              <p className="mt-3 text-sm text-zinc-500">
                Abra a app MB WAY e confirme o pedido. O estado será atualizado
                automaticamente.
              </p>
              <p className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-400">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Aguardando confirmação do pagamento…
              </p>
            </StatusShell>
          ) : created.multibanco ? (
            <div
              className="overflow-hidden border bg-white shadow-sm"
              style={{ borderRadius: radius }}
            >
              <div className="p-6 text-center sm:p-8">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <Landmark className="size-6" />
                </div>
                <h1 className="mt-4 text-lg font-semibold text-zinc-900">
                  Referência Multibanco criada
                </h1>
                <p className="mt-1.5 text-sm text-zinc-500">
                  Pague no homebanking ou em qualquer ATM.
                </p>

                <dl
                  className={cn(
                    "mt-6 grid divide-y rounded-xl border text-center sm:divide-x sm:divide-y-0",
                    created.multibanco.expiresAt
                      ? "sm:grid-cols-4"
                      : "sm:grid-cols-3",
                  )}
                >
                  <div className="p-3">
                    <dt className="text-[11px] text-zinc-500">Entidade</dt>
                    <dd className="mt-1 font-mono text-base font-bold tabular-nums">
                      {created.multibanco.entity}
                    </dd>
                  </div>
                  <div className="p-3">
                    <dt className="text-[11px] text-zinc-500">Referência</dt>
                    <dd className="mt-1 font-mono text-base font-bold tabular-nums">
                      {created.multibanco.reference}
                    </dd>
                  </div>
                  <div className="p-3">
                    <dt className="text-[11px] text-zinc-500">Valor</dt>
                    <dd className="mt-1 font-mono text-base font-bold tabular-nums">
                      {money(created.multibanco.amountCents)}
                    </dd>
                  </div>
                  {created.multibanco.expiresAt ? (
                    <div className="p-3">
                      <dt className="text-[11px] text-zinc-500">Validade</dt>
                      <dd className="mt-1 text-xs font-semibold tabular-nums">
                        {new Intl.DateTimeFormat("pt-PT", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(created.multibanco.expiresAt))}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() =>
                      copyReference(
                        created.multibanco!.entity.replace(/\s/g, ""),
                        "entity",
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-50"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    {copied === "entity"
                      ? "Entidade copiada"
                      : "Copiar entidade"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      copyReference(
                        created.multibanco!.reference.replace(/\s/g, ""),
                        "reference",
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-50"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    {copied === "reference"
                      ? "Referência copiada"
                      : "Copiar referência"}
                  </button>
                </div>

                <p className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Aguardando pagamento…
                </p>
              </div>
            </div>
          ) : (
            <StatusShell
              radius={radius}
              tone="pending"
              title="Aguardando confirmação do pagamento…"
              icon={<Loader2 className="size-6 animate-spin" />}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <CheckoutCard
      link={link}
      className="min-h-svh"
      values={values}
      onChange={setValues}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      errorField={errorField}
      onFirstInteraction={() => {
        if (formStarted.current) return;
        formStarted.current = true;
        if (trackingEnabled) {
          const browser = window as typeof window & {
            fbq?: (...args: unknown[]) => void;
            gtag?: (...args: unknown[]) => void;
            ttq?: { track?: (...args: unknown[]) => void };
            dataLayer?: unknown[];
          };
          const value = link.amountCents / 100;
          browser.fbq?.("track", "InitiateCheckout", {
            content_ids: [link.slug],
            content_name: link.title,
            value,
            currency: link.currency,
          });
          browser.gtag?.("event", "begin_checkout", {
            currency: link.currency,
            value,
            items: [{ item_id: link.slug, item_name: link.title }],
          });
          browser.ttq?.track?.("InitiateCheckout", {
            content_id: link.slug,
            value,
            currency: link.currency,
          });
          browser.dataLayer?.push({
            event: "initiate_checkout",
            payment_link: link.slug,
            value,
            currency: link.currency,
          });
        }
        if (visitorKey.current) {
          void trackPaymentLinkFormStartedAction(link.slug, visitorKey.current);
        }
      }}
    />
  );
}
