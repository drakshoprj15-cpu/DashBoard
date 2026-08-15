"use client";

import * as React from "react";
import { Landmark, Loader2, Lock, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { PublicPaymentLink } from "@/features/payment-links/types";
import type { CustomerFieldKey } from "@/validations/payment-link";

/**
 * A página de cobrança em si.
 *
 * Um componente só, usado pelo preview do painel E pela página pública
 * `/pagar/[slug]`. É de propósito: se o preview fosse uma maquete separada,
 * as duas divergiriam no primeiro ajuste — e o que o utilizador viu ao criar
 * o link deixaria de ser o que o cliente vê ao pagar.
 *
 * No preview (`disabled`), os campos ficam inertes e o botão não envia nada.
 */

export interface CheckoutFormValues {
  method: "mbway" | "multibanco";
  name: string;
  lastName: string;
  email: string;
  phone: string;
  document: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  shippingOptionId: string;
}

export const EMPTY_FORM: CheckoutFormValues = {
  method: "mbway",
  name: "",
  lastName: "",
  email: "",
  phone: "",
  document: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  region: "",
  country: "PT",
  shippingOptionId: "",
};

export interface CheckoutCardProps {
  link: PublicPaymentLink;
  /** Preview: campos inertes, nenhum envio */
  disabled?: boolean;
  submitting?: boolean;
  error?: string | null;
  errorField?: string | null;
  values?: CheckoutFormValues;
  onChange?: (values: CheckoutFormValues) => void;
  onSubmit?: (values: CheckoutFormValues) => void;
  /** Primeiro toque do comprador no formulário (evento de funil) */
  onFirstInteraction?: () => void;
  className?: string;
}

const FIELD_META: Record<
  CustomerFieldKey,
  {
    formKey: keyof CheckoutFormValues;
    label: string;
    placeholder: string;
    type?: string;
    inputMode?: "text" | "email" | "tel" | "numeric";
    autoComplete?: string;
  }
> = {
  firstName: {
    formKey: "name",
    label: "Nome",
    placeholder: "O seu nome",
    autoComplete: "given-name",
  },
  lastName: {
    formKey: "lastName",
    label: "Sobrenome",
    placeholder: "O seu sobrenome",
    autoComplete: "family-name",
  },
  email: {
    formKey: "email",
    label: "Email",
    placeholder: "email@exemplo.com",
    type: "email",
    inputMode: "email",
    autoComplete: "email",
  },
  phone: {
    formKey: "phone",
    label: "Telefone",
    placeholder: "912 345 678",
    type: "tel",
    inputMode: "tel",
    autoComplete: "tel",
  },
  document: {
    formKey: "document",
    label: "NIF / CPF",
    placeholder: "Número fiscal",
    inputMode: "numeric",
  },
  addressLine1: {
    formKey: "addressLine1",
    label: "Morada",
    placeholder: "Rua e número",
    autoComplete: "address-line1",
  },
  addressLine2: {
    formKey: "addressLine2",
    label: "Complemento",
    placeholder: "Andar, porta (opcional)",
    autoComplete: "address-line2",
  },
  postalCode: {
    formKey: "postalCode",
    label: "Código postal",
    placeholder: "1234-567",
    autoComplete: "postal-code",
  },
  city: {
    formKey: "city",
    label: "Cidade",
    placeholder: "Lisboa",
    autoComplete: "address-level2",
  },
  region: {
    formKey: "region",
    label: "Região",
    placeholder: "Distrito / estado",
    autoComplete: "address-level1",
  },
  country: {
    formKey: "country",
    label: "País",
    placeholder: "PT",
    autoComplete: "country",
  },
};

function formatPtMobileInput(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("351")) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]
    .filter(Boolean)
    .join(" ");
}

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric";
  autoComplete?: string;
  mutedColor: string;
  accentColor: string;
  style: React.CSSProperties;
  onValue: (value: string) => void;
}

/**
 * Fora do componente de propósito: declarado dentro do render, o React
 * remontaria o input a cada tecla e o campo perderia o foco.
 */
function Field({
  id,
  label,
  type = "text",
  value,
  placeholder,
  required,
  invalid,
  disabled,
  inputMode,
  autoComplete,
  mutedColor,
  accentColor,
  style,
  onValue,
}: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={`plink-${id}`}
        className="block text-[13px] font-medium"
        style={{ color: mutedColor }}
      >
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={`plink-${id}`}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        onChange={(e) => onValue(e.target.value)}
        className={cn(
          // 16px no mobile evita o zoom automático do iOS ao focar.
          "w-full border px-3.5 py-3 text-base outline-none transition-[border-color,box-shadow] duration-150 sm:text-sm",
          "focus-visible:ring-2 focus-visible:ring-offset-0",
          "disabled:cursor-default",
        )}
        style={{
          ...style,
          ...(invalid ? { borderColor: "#DC2626" } : {}),
          // A cor do foco acompanha o botão configurado no link.
          ["--tw-ring-color" as string]: `${accentColor}55`,
        }}
      />
    </div>
  );
}

export function CheckoutCard({
  link,
  disabled = false,
  submitting = false,
  error = null,
  errorField = null,
  values,
  onChange,
  onSubmit,
  onFirstInteraction,
  className,
}: CheckoutCardProps) {
  const [internal, setInternal] = React.useState<CheckoutFormValues>({
    ...EMPTY_FORM,
    method: link.paymentMethods[0] ?? "mbway",
    shippingOptionId: link.fields.shippingOptions[0]?.id ?? "",
  });
  const touched = React.useRef(false);

  const form = values ?? internal;
  const appearance = link.appearance;
  const radius = appearance.cardRadius;
  const activeMethod = link.paymentMethods.includes(form.method)
    ? form.method
    : (link.paymentMethods[0] ?? "mbway");
  const shadow =
    appearance.cardShadow === "medium"
      ? "0 24px 70px rgba(15, 23, 42, 0.18)"
      : appearance.cardShadow === "soft"
        ? "0 12px 40px rgba(15, 23, 42, 0.10)"
        : "none";
  const pageBackground =
    appearance.backgroundType === "gradient"
      ? `linear-gradient(${appearance.gradientAngle}deg, ${appearance.gradientFrom}, ${appearance.gradientTo})`
      : appearance.backgroundColor;

  const update = React.useCallback(
    (patch: Partial<CheckoutFormValues>) => {
      if (!touched.current) {
        touched.current = true;
        onFirstInteraction?.();
      }
      const next = { ...form, ...patch };
      if (onChange) onChange(next);
      else setInternal(next);
    },
    [form, onChange, onFirstInteraction],
  );

  const shipping = link.fields.requestShipping
    ? (link.fields.shippingOptions.find((o) => o.id === form.shippingOptionId)
        ?.priceCents ??
      link.fields.shippingOptions[0]?.priceCents ??
      0)
    : 0;
  const total = link.amountCents + shipping;

  const money = (cents: number) => formatMoney(cents, link.currency, "pt-PT");

  const fieldStyle: React.CSSProperties = {
    borderColor: appearance.inputBorderColor,
    borderRadius: appearance.inputRadius,
    backgroundColor: appearance.inputBackgroundColor,
    color: appearance.inputTextColor,
  };

  /** Props que todo campo repete — evita 8 linhas iguais em cada chamada. */
  const fieldCommon = {
    disabled: disabled || submitting,
    mutedColor: appearance.textColor,
    accentColor: appearance.inputFocusColor,
    style: fieldStyle,
  };
  const orderedFields = [...link.fields.customerFields]
    .sort((left, right) => left.order - right.order)
    .filter(
      (field) =>
        field.mode !== "hidden" ||
        (field.key === "phone" && activeMethod === "mbway"),
    );

  return (
    <div
      className={cn("min-h-full w-full", className)}
      style={{ background: pageBackground }}
    >
      <div
        className="mx-auto w-full px-4 py-8 sm:py-12"
        style={{ maxWidth: appearance.cardWidth + 32 }}
      >
        {link.brand.logoUrl || link.brand.companyName ? (
          <div
            className={cn(
              "flex flex-col",
              link.brand.logoAlignment === "left" && "items-start text-left",
              link.brand.logoAlignment === "center" &&
                "items-center text-center",
              link.brand.logoAlignment === "right" && "items-end text-right",
            )}
            style={{ marginBottom: link.brand.logoSpacing }}
          >
            {link.brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
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
            ) : (
              <p
                className="text-lg font-semibold"
                style={{ color: appearance.titleColor }}
              >
                {link.brand.companyName}
              </p>
            )}
            {link.brand.logoSubtitle ? (
              <p
                className="mt-1 text-xs"
                style={{ color: appearance.textColor }}
              >
                {link.brand.logoSubtitle}
              </p>
            ) : null}
          </div>
        ) : null}

        <div
          className="overflow-hidden border"
          style={{
            backgroundColor: appearance.cardColor,
            borderColor: appearance.cardBorderColor,
            borderWidth: appearance.cardBorderWidth,
            borderRadius: radius,
            boxShadow: shadow,
          }}
        >
          <div style={{ padding: appearance.cardPadding }}>
            <h1
              className="text-center tracking-tight"
              style={{
                color: appearance.titleColor,
                fontSize: appearance.titleSize,
                fontWeight: appearance.titleWeight,
              }}
            >
              {link.title}
            </h1>
            {link.description ? (
              <p
                className="mt-1.5 text-center text-sm leading-relaxed"
                style={{ color: appearance.textColor }}
              >
                {link.description}
              </p>
            ) : null}

            {link.product ? (
              <div
                className="mt-5 flex items-center gap-3 border p-3"
                style={{
                  borderColor: appearance.cardBorderColor,
                  borderRadius: Math.max(6, radius - 4),
                }}
              >
                {link.product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.product.imageUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: appearance.titleColor }}
                  >
                    {link.product.name}
                  </p>
                  {link.product.description ? (
                    <p
                      className="line-clamp-2 text-xs"
                      style={{ color: appearance.textColor }}
                    >
                      {link.product.description}
                    </p>
                  ) : null}
                  <p
                    className="text-xs"
                    style={{ color: appearance.textColor }}
                  >
                    {link.product.quantity} ×{" "}
                    {money(link.product.unitPriceCents)}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-6 text-center">
              <p
                className="text-[11px] font-medium tracking-[0.14em] uppercase"
                style={{ color: appearance.textColor }}
              >
                Valor a pagar
              </p>
              <p
                className="mt-1 text-[34px] leading-none font-bold tracking-tight tabular-nums"
                style={{ color: appearance.titleColor }}
              >
                {money(total)}
              </p>
              {shipping > 0 ? (
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: appearance.textColor }}
                >
                  {money(link.amountCents)} + {money(shipping)} de envio
                </p>
              ) : null}
            </div>

            <form
              className="mt-6 space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (disabled || submitting) return;
                onSubmit?.({ ...form, method: activeMethod });
              }}
            >
              <fieldset className="space-y-2" disabled={disabled || submitting}>
                <legend
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: appearance.textColor }}
                >
                  Forma de pagamento
                </legend>
                <div
                  className={cn(
                    "grid gap-2",
                    link.paymentMethods.length > 1
                      ? "grid-cols-2"
                      : "grid-cols-1",
                  )}
                >
                  {(
                    [
                      { id: "mbway", label: "MB WAY", Icon: Smartphone },
                      { id: "multibanco", label: "Multibanco", Icon: Landmark },
                    ] as const
                  )
                    .filter(({ id }) => link.paymentMethods.includes(id))
                    .map(({ id, label, Icon }) => {
                      const active = activeMethod === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => update({ method: id })}
                          className="flex items-center justify-center gap-2 border px-3 py-3 text-sm font-medium transition-colors duration-150"
                          style={{
                            borderRadius: Math.max(6, radius - 4),
                            borderColor: active
                              ? appearance.buttonColor
                              : appearance.inputBorderColor,
                            backgroundColor: active
                              ? `${appearance.buttonColor}14`
                              : appearance.inputBackgroundColor,
                            color: active
                              ? appearance.buttonColor
                              : appearance.inputTextColor,
                          }}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                          {label}
                        </button>
                      );
                    })}
                </div>
              </fieldset>

              {orderedFields.map((field) => {
                const meta = FIELD_META[field.key];
                const formKey = meta.formKey;
                const isMbwayPhone =
                  field.key === "phone" && activeMethod === "mbway";
                const validationKey =
                  field.key === "firstName" ? "name" : field.key;
                return (
                  <Field
                    {...fieldCommon}
                    key={field.key}
                    id={String(formKey)}
                    label={isMbwayPhone ? "Telemóvel MB WAY" : meta.label}
                    value={String(form[formKey])}
                    placeholder={meta.placeholder}
                    type={meta.type}
                    inputMode={meta.inputMode}
                    autoComplete={meta.autoComplete}
                    required={field.mode === "required" || isMbwayPhone}
                    invalid={
                      errorField === validationKey || errorField === field.key
                    }
                    onValue={(value) =>
                      update({
                        [formKey]:
                          field.key === "phone" && activeMethod === "mbway"
                            ? formatPtMobileInput(value)
                            : value,
                      } as Partial<CheckoutFormValues>)
                    }
                  />
                );
              })}

              {link.fields.requestShipping &&
              link.fields.shippingOptions.length > 0 ? (
                <fieldset
                  className="space-y-2"
                  disabled={disabled || submitting}
                >
                  <legend
                    className="mb-2 block text-[13px] font-medium"
                    style={{ color: appearance.textColor }}
                  >
                    Forma de envio
                  </legend>
                  <div className="space-y-2">
                    {link.fields.shippingOptions.map((option) => {
                      const active =
                        (form.shippingOptionId ||
                          link.fields.shippingOptions[0]?.id) === option.id;
                      return (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-center gap-3 border px-3.5 py-3 text-sm transition-colors duration-150"
                          style={{
                            borderRadius: Math.max(6, radius - 4),
                            borderColor: active
                              ? appearance.buttonColor
                              : appearance.inputBorderColor,
                            backgroundColor: appearance.inputBackgroundColor,
                            color: appearance.inputTextColor,
                          }}
                        >
                          <input
                            type="radio"
                            name="shippingOptionId"
                            value={option.id}
                            checked={active}
                            onChange={() =>
                              update({ shippingOptionId: option.id })
                            }
                            className="size-4 shrink-0"
                            style={{ accentColor: appearance.buttonColor }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {option.name}
                            </span>
                            {option.estimate ? (
                              <span
                                className="block text-xs"
                                style={{ color: appearance.textColor }}
                              >
                                {option.estimate}
                              </span>
                            ) : null}
                          </span>
                          <span className="font-medium tabular-nums">
                            {option.priceCents === 0
                              ? "Grátis"
                              : money(option.priceCents)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="border px-3.5 py-2.5 text-sm"
                  style={{
                    borderRadius: Math.max(6, radius - 4),
                    borderColor: "#DC262633",
                    backgroundColor: "#DC26260F",
                    color: "#DC2626",
                  }}
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={disabled || submitting}
                className="flex w-full items-center justify-center gap-2 px-4 transition-colors duration-200 hover:bg-[var(--button-hover)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-70"
                style={{
                  backgroundColor: appearance.buttonColor,
                  color: appearance.buttonTextColor,
                  borderRadius: appearance.buttonRadius,
                  height: appearance.buttonHeight,
                  fontSize: appearance.buttonFontSize,
                  fontWeight: appearance.buttonWeight,
                  ["--button-hover" as string]: appearance.buttonHoverColor,
                  ["--tw-ring-color" as string]: appearance.buttonColor,
                }}
              >
                {submitting ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    A preparar pagamento…
                  </>
                ) : (
                  link.appearance.buttonText
                )}
              </button>
            </form>
          </div>

          <div
            className="flex items-center justify-center gap-1.5 border-t px-5 py-3"
            style={{ borderColor: appearance.cardBorderColor }}
          >
            <Lock
              className="size-3"
              style={{ color: appearance.textColor }}
              aria-hidden="true"
            />
            <span
              className="text-[11px]"
              style={{ color: appearance.textColor }}
            >
              {appearance.securityText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
