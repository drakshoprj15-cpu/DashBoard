"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Monitor,
  Package,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ImageDropzone } from "@/components/image-dropzone";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { CheckoutCard } from "@/features/payment-links/checkout-card";
import { ShareDialog } from "@/features/payment-links/share-dialog";
import { savePaymentLinkAction } from "@/features/payment-links/actions";
import {
  DEFAULT_PAYMENT_LINK_APPEARANCE,
  DEFAULT_PAYMENT_LINK_BRAND,
  DEFAULT_PAYMENT_LINK_SEO,
  DEFAULT_PAYMENT_LINK_SUCCESS,
  type PublicPaymentLink,
} from "@/features/payment-links/types";
import type {
  CatalogProductOption,
  PaymentLinkDomainOption,
  PaymentLinkPixelOption,
} from "@/features/payment-links/queries";
import {
  DEFAULT_CUSTOMER_FIELDS,
  type CustomerFieldInput,
  type CustomerFieldKey,
  type PaymentLinkAppearanceInput,
  type PaymentLinkBrandInput,
  type PaymentLinkMethod,
  type PaymentLinkSeoInput,
  type PaymentLinkSuccessInput,
  type RequestFieldMode,
} from "@/validations/payment-link";

/**
 * Editor de um link de pagamento.
 *
 * Duas colunas: configuração à esquerda, a página real do comprador à
 * direita. O preview usa o MESMO componente da rota pública — o que se vê
 * aqui é literalmente o que o cliente vai ver.
 */

export interface LinkFormState {
  id?: string;
  status?: "draft" | "published" | "unpublished" | "archived";
  name: string;
  title: string;
  description: string;
  amountCents: number;
  slug: string;
  showProduct: boolean;
  productId: string;
  productName: string;
  productDescription: string;
  productImageUrl: string;
  productQuantity: number;
  paymentMethods: PaymentLinkMethod[];
  requestName: RequestFieldMode;
  requestEmail: RequestFieldMode;
  requestPhone: RequestFieldMode;
  requiresAddress: boolean;
  requestShipping: boolean;
  customerFields: CustomerFieldInput[];
  shippingOptions: {
    id: string;
    name: string;
    estimate: string;
    priceCents: number;
  }[];
  logoUrl: string;
  brand: PaymentLinkBrandInput;
  appearance: PaymentLinkAppearanceInput;
  backgroundStyle: "light" | "dark";
  buttonText: string;
  success: PaymentLinkSuccessInput;
  seo: PaymentLinkSeoInput;
  domainId: string;
  metaPixelEnabled: boolean;
  pixelIds: string[];
  expiration: "never" | "1h" | "24h" | "3d" | "7d" | "custom";
  expiresAt: string;
  usageLimit: "unlimited" | "single" | "custom";
  maxPayments: number;
}

export const DEFAULT_FORM: LinkFormState = {
  name: "",
  title: "Pagamento do pedido",
  description: "",
  amountCents: 0,
  slug: "",
  showProduct: false,
  productId: "",
  productName: "",
  productDescription: "",
  productImageUrl: "",
  productQuantity: 1,
  paymentMethods: ["mbway", "multibanco"],
  requestName: "required",
  requestEmail: "required",
  requestPhone: "optional",
  requiresAddress: false,
  requestShipping: false,
  customerFields: DEFAULT_CUSTOMER_FIELDS.map((field) => ({ ...field })),
  shippingOptions: [],
  logoUrl: "",
  brand: { ...DEFAULT_PAYMENT_LINK_BRAND },
  appearance: { ...DEFAULT_PAYMENT_LINK_APPEARANCE },
  backgroundStyle: "light",
  buttonText: "Pagar agora",
  success: { ...DEFAULT_PAYMENT_LINK_SUCCESS },
  seo: { ...DEFAULT_PAYMENT_LINK_SEO },
  domainId: "",
  metaPixelEnabled: true,
  pixelIds: [],
  expiration: "never",
  expiresAt: "",
  usageLimit: "unlimited",
  maxPayments: 1,
};

const FIELD_MODES: { value: RequestFieldMode; label: string }[] = [
  { value: "required", label: "Obrigatório" },
  { value: "optional", label: "Opcional" },
  { value: "hidden", label: "Oculto" },
];

const CUSTOMER_FIELD_LABELS: Record<CustomerFieldKey, string> = {
  firstName: "Nome",
  lastName: "Sobrenome",
  email: "Email",
  phone: "Telemóvel",
  document: "NIF / CPF",
  addressLine1: "Morada",
  addressLine2: "Complemento",
  postalCode: "Código postal",
  city: "Cidade",
  region: "Região",
  country: "País",
};

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start gap-2.5">
          <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            {description ? (
              <p className="text-muted-foreground text-xs">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Valor em cêntimos digitado como dígitos corridos: "700" vira 7,00 €.
 * Evita as ambiguidades de vírgula e ponto decimal — e nunca há float no
 * meio do caminho.
 */
function MoneyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (cents: number) => void;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="numeric"
        value={formatMoney(value, "EUR", "pt-PT")}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
          onChange(digits ? Number.parseInt(digits, 10) : 0);
        }}
        className="pr-14 text-right font-semibold tabular-nums"
      />
      <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
        EUR
      </span>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          className={suffix ? "pr-9" : undefined}
          onChange={(event) =>
            onChange(
              Math.min(max, Math.max(min, Number(event.target.value) || min)),
            )
          }
        />
        {suffix ? (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  defaultValue,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-picker`}
          type="color"
          value={value}
          aria-label={`${label} — seletor de cor`}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="font-mono text-xs uppercase"
          maxLength={7}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Restaurar ${label}`}
          title="Restaurar padrão"
          disabled={value.toUpperCase() === defaultValue.toUpperCase()}
          onClick={() => onChange(defaultValue)}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** Grupo de botões exclusivos — usado nos modos de campo e no raio. */
function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="bg-muted inline-flex w-full rounded-md p-0.5"
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-[5px] px-2 py-1.5 text-xs font-medium transition-colors duration-150",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
        ) : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export interface LinkFormProps {
  initial?: LinkFormState;
  domains: PaymentLinkDomainOption[];
  products: CatalogProductOption[];
  pixels: PaymentLinkPixelOption[];
  appOrigin: string;
}

export function LinkForm({
  initial,
  domains,
  products,
  pixels,
  appOrigin,
}: LinkFormProps) {
  const router = useRouter();
  const [form, setForm] = React.useState<LinkFormState>(
    initial ?? DEFAULT_FORM,
  );
  const [viewport, setViewport] = React.useState<"desktop" | "mobile">(
    "desktop",
  );
  const [saving, setSaving] = React.useState(false);
  const [savingIntent, setSavingIntent] = React.useState<
    "draft" | "publish" | null
  >(null);
  const [createdUrl, setCreatedUrl] = React.useState<string | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);

  const isEditing = Boolean(initial?.id);

  const set = React.useCallback(
    <K extends keyof LinkFormState>(key: K, value: LinkFormState[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const setAppearance = React.useCallback(
    <K extends keyof PaymentLinkAppearanceInput>(
      key: K,
      value: PaymentLinkAppearanceInput[K],
    ) => {
      setForm((current) => ({
        ...current,
        appearance: { ...current.appearance, [key]: value },
      }));
    },
    [],
  );

  const setBrand = React.useCallback(
    <K extends keyof PaymentLinkBrandInput>(
      key: K,
      value: PaymentLinkBrandInput[K],
    ) => {
      setForm((current) => ({
        ...current,
        brand: { ...current.brand, [key]: value },
      }));
    },
    [],
  );

  const setCustomerField = React.useCallback(
    (key: CustomerFieldKey, mode: RequestFieldMode) => {
      setForm((current) => {
        const customerFields = current.customerFields.map((field) =>
          field.key === key ? { ...field, mode } : field,
        );
        return {
          ...current,
          customerFields,
          ...(key === "firstName" ? { requestName: mode } : {}),
          ...(key === "email" ? { requestEmail: mode } : {}),
          ...(key === "phone" ? { requestPhone: mode } : {}),
        };
      });
    },
    [],
  );

  const moveCustomerField = React.useCallback(
    (key: CustomerFieldKey, direction: -1 | 1) => {
      setForm((current) => {
        const fields = [...current.customerFields].sort(
          (left, right) => left.order - right.order,
        );
        const index = fields.findIndex((field) => field.key === key);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= fields.length)
          return current;
        [fields[index], fields[nextIndex]] = [fields[nextIndex], fields[index]];
        return {
          ...current,
          customerFields: fields.map((field, order) => ({ ...field, order })),
        };
      });
    },
    [],
  );

  /** O que o preview desenha — o mesmo formato que a rota pública recebe. */
  const previewLink: PublicPaymentLink = React.useMemo(
    () => ({
      slug: form.slug || "preview",
      title: form.title || "Título da página",
      description: form.description || null,
      amountCents: form.amountCents,
      currency: "EUR",
      product: form.showProduct
        ? {
            name: form.productName || "Produto",
            description: form.productDescription,
            imageUrl: form.productImageUrl,
            quantity: form.productQuantity,
            unitPriceCents: form.amountCents,
          }
        : null,
      paymentMethods: form.paymentMethods,
      brand: {
        ...DEFAULT_PAYMENT_LINK_BRAND,
        ...form.brand,
        logoUrl: form.logoUrl || null,
      },
      appearance: {
        ...DEFAULT_PAYMENT_LINK_APPEARANCE,
        ...form.appearance,
        borderColor: form.appearance.cardBorderColor,
        backgroundStyle: form.backgroundStyle,
        borderRadius: form.appearance.cardRadius,
        buttonText: form.buttonText || "Pagar",
      },
      fields: {
        requestName: form.requestName,
        requestEmail: form.requestEmail,
        requestPhone: form.requestPhone,
        requiresAddress: form.requiresAddress,
        requestShipping: form.requestShipping,
        shippingOptions: form.shippingOptions,
        customerFields: form.customerFields,
      },
      success: form.success,
      seo: form.seo,
    }),
    [form],
  );

  const domainOrigin = form.domainId
    ? `https://${domains.find((d) => d.id === form.domainId)?.hostname ?? ""}`
    : appOrigin;

  async function persist(intent: "draft" | "publish") {
    setSaving(true);
    setSavingIntent(intent);

    try {
      const fieldMode = (key: CustomerFieldKey, fallback: RequestFieldMode) =>
        form.customerFields.find((field) => field.key === key)?.mode ??
        fallback;
      const result = await savePaymentLinkAction(
        {
          name: form.name,
          title: form.title,
          description: form.description,
          amountCents: form.amountCents,
          currency: "EUR",
          paymentMethods: form.paymentMethods,
          slug: form.slug,
          showProduct: form.showProduct,
          productId: form.productId,
          product: form.showProduct
            ? {
                name: form.productName,
                description: form.productDescription,
                imageUrl: form.productImageUrl,
                quantity: form.productQuantity,
                unitPriceCents: form.amountCents,
              }
            : undefined,
          requestName: fieldMode("firstName", form.requestName),
          requestEmail: fieldMode("email", form.requestEmail),
          requestPhone: fieldMode("phone", form.requestPhone),
          requiresAddress: form.requiresAddress,
          requestShipping: form.requestShipping,
          shippingOptions: form.shippingOptions,
          customerFields: form.customerFields,
          logoUrl: form.logoUrl,
          brand: form.brand,
          appearance: form.appearance,
          buttonColor: form.appearance.buttonColor,
          buttonTextColor: form.appearance.buttonTextColor,
          borderColor: form.appearance.cardBorderColor,
          backgroundStyle: form.backgroundStyle,
          borderRadius: form.appearance.cardRadius,
          buttonText: form.buttonText,
          success: form.success,
          seo: form.seo,
          domainId: form.domainId,
          metaPixelEnabled: form.metaPixelEnabled,
          pixelIds: form.pixelIds,
          expiration: form.expiration,
          expiresAt: form.expiresAt,
          usageLimit: form.usageLimit,
          maxPayments: form.maxPayments,
        },
        form.id,
        intent,
      );

      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível guardar o link.");
        return;
      }

      toast.success(result.message ?? "Link guardado.");
      setLastSavedAt(new Date());

      if (intent === "publish" && result.link) {
        setCreatedUrl(result.link.url);
        return;
      }
      if (!isEditing && result.link) {
        router.replace(`/financeiro/links-de-pagamento/${result.link.id}`);
      }
      router.refresh();
    } finally {
      setSaving(false);
      setSavingIntent(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await persist("publish");
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Voltar para a lista de links"
              onClick={() => router.push("/financeiro/links-de-pagamento")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                {isEditing ? "Editar link" : "Novo link de pagamento"}
              </h2>
              <p className="text-muted-foreground text-sm">
                Configure a cobrança à esquerda e veja a página do cliente à
                direita.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {lastSavedAt ? (
              <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex">
                <Check
                  className="size-3.5 text-emerald-500"
                  aria-hidden="true"
                />
                Salvo às{" "}
                {lastSavedAt.toLocaleTimeString("pt-PT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="lg:hidden"
              onClick={() => setMobilePreviewOpen(true)}
            >
              <Eye className="size-4" aria-hidden="true" />
              Visualizar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void persist("draft")}
            >
              {savingIntent === "draft" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              Salvar rascunho
            </Button>
            <Button type="submit" disabled={saving}>
              {savingIntent === "publish" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Publicar
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div className="space-y-4">
            <Section
              icon={Settings2}
              title="Informações"
              description="O nome interno aparece apenas no Infinity."
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome interno</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Pagamento Cliente #001"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Título da página</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Pagamento do pedido"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Texto apresentado ao comprador"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Valor</Label>
                <MoneyInput
                  id="amount"
                  value={form.amountCents}
                  onChange={(cents) => set("amountCents", cents)}
                />
                <p className="text-muted-foreground text-xs">
                  Digite apenas os números: 700 resulta em 7,00 €.
                </p>
              </div>
            </Section>

            <Section
              icon={Landmark}
              title="Métodos de pagamento"
              description="Somente os métodos ativados aparecem ao comprador. A publicação confirma o suporte real da Broski."
            >
              {(
                [
                  [
                    "mbway",
                    "MB WAY",
                    "Pedido enviado para a app no telemóvel.",
                  ],
                  [
                    "multibanco",
                    "Multibanco",
                    "Gera entidade, referência e valor.",
                  ],
                ] as const
              ).map(([method, label, hint]) => (
                <ToggleRow
                  key={method}
                  id={`payment-${method}`}
                  label={label}
                  hint={hint}
                  checked={form.paymentMethods.includes(method)}
                  onCheckedChange={(checked) =>
                    set(
                      "paymentMethods",
                      checked
                        ? Array.from(new Set([...form.paymentMethods, method]))
                        : form.paymentMethods.filter((item) => item !== method),
                    )
                  }
                />
              ))}
              {form.paymentMethods.length === 0 ? (
                <p role="alert" className="text-destructive text-xs">
                  Ative ao menos um método para publicar.
                </p>
              ) : null}
            </Section>

            <Section
              icon={Package}
              title="Produto"
              description="Exibe um item na página. Os dados ficam guardados no link."
            >
              <ToggleRow
                id="show-product"
                label="Mostrar produto"
                hint="Uma cópia dos dados fica no link — apagar o produto do catálogo não quebra a página."
                checked={form.showProduct}
                onCheckedChange={(checked) => set("showProduct", checked)}
              />

              {form.showProduct ? (
                <div className="space-y-4 rounded-lg border p-3">
                  {products.length > 0 ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-product">
                        Usar produto do catálogo
                      </Label>
                      <select
                        id="catalog-product"
                        value={form.productId}
                        onChange={(e) => {
                          const product = products.find(
                            (p) => p.id === e.target.value,
                          );
                          setForm((current) => ({
                            ...current,
                            productId: e.target.value,
                            productName: product?.name ?? current.productName,
                            productDescription:
                              product?.description ??
                              current.productDescription,
                            productImageUrl:
                              product?.imageUrl ?? current.productImageUrl,
                            amountCents:
                              product?.priceCents ?? current.amountCents,
                          }));
                        }}
                        className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                      >
                        <option value="">Produto personalizado</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ·{" "}
                            {formatMoney(product.priceCents, "EUR", "pt-PT")}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="product-name">Nome do produto</Label>
                    <Input
                      id="product-name"
                      value={form.productName}
                      onChange={(e) => set("productName", e.target.value)}
                      placeholder="Nome apresentado ao cliente"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-description">Descrição</Label>
                    <Input
                      id="product-description"
                      value={form.productDescription}
                      onChange={(e) =>
                        set("productDescription", e.target.value)
                      }
                      placeholder="Detalhe curto"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-quantity">Quantidade</Label>
                    <Input
                      id="product-quantity"
                      type="number"
                      min={1}
                      max={999}
                      value={form.productQuantity}
                      onChange={(e) =>
                        set(
                          "productQuantity",
                          Math.max(1, Number(e.target.value) || 1),
                        )
                      }
                    />
                  </div>
                  <ImageDropzone
                    id="product-image"
                    label="Imagem do produto"
                    endpoint="/api/uploads/product-image"
                    value={form.productImageUrl}
                    onChange={(url) => set("productImageUrl", url)}
                    allowRemoteUrl={false}
                    allowSvg={false}
                    hint="PNG, JPEG ou WebP · até 3 MB"
                  />
                </div>
              ) : null}
            </Section>

            <Section
              icon={Users}
              title="Dados do cliente"
              description="Escolha visibilidade, obrigatoriedade e ordem dos campos."
            >
              {[...form.customerFields]
                .sort((left, right) => left.order - right.order)
                .map((field, index, fields) => (
                  <div
                    key={field.key}
                    className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(100px,0.7fr)_minmax(220px,1.3fr)_auto]"
                  >
                    <Label className="text-xs">
                      {CUSTOMER_FIELD_LABELS[field.key]}
                    </Label>
                    <SegmentedControl
                      ariaLabel={`Modo do campo ${CUSTOMER_FIELD_LABELS[field.key]}`}
                      options={FIELD_MODES}
                      value={field.mode}
                      onChange={(mode) => setCustomerField(field.key, mode)}
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        aria-label={`Mover ${CUSTOMER_FIELD_LABELS[field.key]} para cima`}
                        onClick={() => moveCustomerField(field.key, -1)}
                      >
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === fields.length - 1}
                        aria-label={`Mover ${CUSTOMER_FIELD_LABELS[field.key]} para baixo`}
                        onClick={() => moveCustomerField(field.key, 1)}
                      >
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              <p className="text-muted-foreground text-xs">
                Com MB WAY ativo, o telemóvel aparece e é validado mesmo que
                esteja configurado como opcional.
              </p>
            </Section>

            <Section
              icon={Globe}
              title="Morada e envio"
              description="Para produtos físicos. O frete é somado no servidor."
            >
              <ToggleRow
                id="requires-address"
                label="Pedir morada ao cliente"
                hint="Morada, código postal e localidade (validados no formato português)."
                checked={form.requiresAddress}
                onCheckedChange={(checked) => {
                  set("requiresAddress", checked);
                  if (!checked) set("requestShipping", false);
                  for (const key of [
                    "addressLine1",
                    "addressLine2",
                    "postalCode",
                    "city",
                    "region",
                    "country",
                  ] as const) {
                    setCustomerField(
                      key,
                      checked
                        ? key === "addressLine2" || key === "region"
                          ? "optional"
                          : "required"
                        : "hidden",
                    );
                  }
                }}
              />
              <ToggleRow
                id="request-shipping"
                label="Pedir forma de envio"
                hint="O valor escolhido é somado ao total pelo servidor, nunca pelo navegador."
                checked={form.requestShipping}
                onCheckedChange={(checked) => {
                  set("requestShipping", checked);
                  if (checked) {
                    set("requiresAddress", true);
                    for (const key of [
                      "addressLine1",
                      "postalCode",
                      "city",
                      "country",
                    ] as const) {
                      setCustomerField(key, "required");
                    }
                    if (form.shippingOptions.length === 0) {
                      set("shippingOptions", [
                        {
                          id: crypto.randomUUID().slice(0, 8),
                          name: "Entrega padrão",
                          estimate: "2–4 dias",
                          priceCents: 390,
                        },
                      ]);
                    }
                  }
                }}
              />

              {form.requestShipping ? (
                <div className="space-y-3">
                  {form.shippingOptions.map((option, index) => (
                    <div
                      key={option.id}
                      className="space-y-2 rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-xs font-medium">
                          Opção {index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover ${option.name || "opção de envio"}`}
                          onClick={() =>
                            set(
                              "shippingOptions",
                              form.shippingOptions.filter(
                                (o) => o.id !== option.id,
                              ),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <Input
                        value={option.name}
                        aria-label="Nome da forma de envio"
                        placeholder="Entrega padrão"
                        onChange={(e) =>
                          set(
                            "shippingOptions",
                            form.shippingOptions.map((o) =>
                              o.id === option.id
                                ? { ...o, name: e.target.value }
                                : o,
                            ),
                          )
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={option.estimate}
                          aria-label="Prazo de entrega"
                          placeholder="2–4 dias"
                          onChange={(e) =>
                            set(
                              "shippingOptions",
                              form.shippingOptions.map((o) =>
                                o.id === option.id
                                  ? { ...o, estimate: e.target.value }
                                  : o,
                              ),
                            )
                          }
                        />
                        <MoneyInput
                          id={`shipping-${option.id}`}
                          value={option.priceCents}
                          onChange={(cents) =>
                            set(
                              "shippingOptions",
                              form.shippingOptions.map((o) =>
                                o.id === option.id
                                  ? { ...o, priceCents: cents }
                                  : o,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                  {form.shippingOptions.length < 6 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        set("shippingOptions", [
                          ...form.shippingOptions,
                          {
                            id: crypto.randomUUID().slice(0, 8),
                            name: "",
                            estimate: "",
                            priceCents: 0,
                          },
                        ])
                      }
                    >
                      <Plus className="size-3.5" />
                      Adicionar opção
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Section>

            <Section
              icon={ImageIcon}
              title="Marca"
              description="Identifique claramente a empresa proprietária do link."
            >
              <ImageDropzone
                id="link-logo"
                label="Logo"
                endpoint="/api/uploads/logo"
                value={form.logoUrl}
                onChange={(url) => set("logoUrl", url)}
                allowRemoteUrl={false}
                allowSvg={false}
                hint="PNG, JPEG ou WebP · até 3 MB"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company-name">Nome da empresa</Label>
                  <Input
                    id="company-name"
                    value={form.brand.companyName}
                    onChange={(event) =>
                      setBrand("companyName", event.target.value)
                    }
                    placeholder="A sua empresa"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="logo-subtitle">Texto abaixo da logo</Label>
                  <Input
                    id="logo-subtitle"
                    value={form.brand.logoSubtitle}
                    onChange={(event) =>
                      setBrand("logoSubtitle", event.target.value)
                    }
                    placeholder="Cobrança emitida por…"
                  />
                </div>
              </div>
              <ImageDropzone
                id="link-favicon"
                label="Favicon"
                endpoint="/api/uploads/logo"
                value={form.brand.faviconUrl ?? ""}
                onChange={(url) => {
                  setBrand("faviconUrl", url);
                  setForm((current) => ({
                    ...current,
                    seo: { ...current.seo, faviconUrl: url },
                  }));
                }}
                allowRemoteUrl={false}
                allowSvg={false}
                hint="PNG, JPEG ou WebP quadrado · até 3 MB"
              />
              <div className="space-y-1.5">
                <Label className="text-xs">Alinhamento da logo</Label>
                <SegmentedControl
                  ariaLabel="Alinhamento da logo"
                  options={[
                    { value: "left" as const, label: "Esquerda" },
                    { value: "center" as const, label: "Centro" },
                    { value: "right" as const, label: "Direita" },
                  ]}
                  value={form.brand.logoAlignment}
                  onChange={(value) => setBrand("logoAlignment", value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  id="logo-width"
                  label="Largura"
                  value={form.brand.logoWidth}
                  min={40}
                  max={320}
                  suffix="px"
                  onChange={(value) => setBrand("logoWidth", value)}
                />
                <NumberField
                  id="logo-height"
                  label="Altura"
                  value={form.brand.logoHeight}
                  min={24}
                  max={160}
                  suffix="px"
                  onChange={(value) => setBrand("logoHeight", value)}
                />
                <NumberField
                  id="logo-spacing"
                  label="Espaçamento"
                  value={form.brand.logoSpacing}
                  min={0}
                  max={64}
                  suffix="px"
                  onChange={(value) => setBrand("logoSpacing", value)}
                />
              </div>
              <div className="border-t pt-4">
                <p className="mb-3 text-xs font-medium">
                  Quando o link expirar
                </p>
                <div className="space-y-3">
                  <Input
                    value={form.success.expiredTitle}
                    aria-label="Título do link expirado"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        success: {
                          ...current.success,
                          expiredTitle: event.target.value,
                        },
                      }))
                    }
                  />
                  <Textarea
                    value={form.success.expiredDescription}
                    aria-label="Descrição do link expirado"
                    rows={2}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        success: {
                          ...current.success,
                          expiredDescription: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </Section>

            <Section
              icon={Palette}
              title="Aparência"
              description="Personalize fundo, card, tipografia, inputs e botões."
            >
              <details open className="group rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Background
                </summary>
                <div className="mt-3 space-y-3">
                  <SegmentedControl
                    ariaLabel="Tipo de fundo"
                    options={[
                      { value: "solid" as const, label: "Cor" },
                      { value: "gradient" as const, label: "Gradiente" },
                    ]}
                    value={form.appearance.backgroundType}
                    onChange={(value) => setAppearance("backgroundType", value)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ColorField
                      id="background-color"
                      label="Background"
                      value={form.appearance.backgroundColor}
                      defaultValue={
                        DEFAULT_PAYMENT_LINK_APPEARANCE.backgroundColor
                      }
                      onChange={(value) =>
                        setAppearance("backgroundColor", value)
                      }
                    />
                    {form.appearance.backgroundType === "gradient" ? (
                      <>
                        <ColorField
                          id="gradient-from"
                          label="Gradiente inicial"
                          value={form.appearance.gradientFrom}
                          defaultValue={
                            DEFAULT_PAYMENT_LINK_APPEARANCE.gradientFrom
                          }
                          onChange={(value) =>
                            setAppearance("gradientFrom", value)
                          }
                        />
                        <ColorField
                          id="gradient-to"
                          label="Gradiente final"
                          value={form.appearance.gradientTo}
                          defaultValue={
                            DEFAULT_PAYMENT_LINK_APPEARANCE.gradientTo
                          }
                          onChange={(value) =>
                            setAppearance("gradientTo", value)
                          }
                        />
                        <NumberField
                          id="gradient-angle"
                          label="Ângulo"
                          value={form.appearance.gradientAngle}
                          min={0}
                          max={360}
                          suffix="°"
                          onChange={(value) =>
                            setAppearance("gradientAngle", value)
                          }
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              </details>

              <details open className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Card e tipografia
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ColorField
                    id="card-color"
                    label="Card"
                    value={form.appearance.cardColor}
                    defaultValue={DEFAULT_PAYMENT_LINK_APPEARANCE.cardColor}
                    onChange={(value) => setAppearance("cardColor", value)}
                  />
                  <ColorField
                    id="card-border-color"
                    label="Borda"
                    value={form.appearance.cardBorderColor}
                    defaultValue={
                      DEFAULT_PAYMENT_LINK_APPEARANCE.cardBorderColor
                    }
                    onChange={(value) =>
                      setAppearance("cardBorderColor", value)
                    }
                  />
                  <ColorField
                    id="title-color"
                    label="Título"
                    value={form.appearance.titleColor}
                    defaultValue={DEFAULT_PAYMENT_LINK_APPEARANCE.titleColor}
                    onChange={(value) => setAppearance("titleColor", value)}
                  />
                  <ColorField
                    id="text-color"
                    label="Texto secundário"
                    value={form.appearance.textColor}
                    defaultValue={DEFAULT_PAYMENT_LINK_APPEARANCE.textColor}
                    onChange={(value) => setAppearance("textColor", value)}
                  />
                  <NumberField
                    id="card-width"
                    label="Largura"
                    value={form.appearance.cardWidth}
                    min={320}
                    max={720}
                    suffix="px"
                    onChange={(value) => setAppearance("cardWidth", value)}
                  />
                  <NumberField
                    id="card-padding"
                    label="Espaçamento"
                    value={form.appearance.cardPadding}
                    min={16}
                    max={56}
                    suffix="px"
                    onChange={(value) => setAppearance("cardPadding", value)}
                  />
                  <NumberField
                    id="card-radius"
                    label="Border radius"
                    value={form.appearance.cardRadius}
                    min={0}
                    max={40}
                    suffix="px"
                    onChange={(value) => setAppearance("cardRadius", value)}
                  />
                  <NumberField
                    id="card-border-width"
                    label="Espessura da borda"
                    value={form.appearance.cardBorderWidth}
                    min={0}
                    max={4}
                    suffix="px"
                    onChange={(value) =>
                      setAppearance("cardBorderWidth", value)
                    }
                  />
                  <NumberField
                    id="title-size"
                    label="Tamanho do título"
                    value={form.appearance.titleSize}
                    min={16}
                    max={42}
                    suffix="px"
                    onChange={(value) => setAppearance("titleSize", value)}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="card-shadow" className="text-xs">
                      Sombra
                    </Label>
                    <select
                      id="card-shadow"
                      value={form.appearance.cardShadow}
                      onChange={(event) =>
                        setAppearance(
                          "cardShadow",
                          event.target
                            .value as PaymentLinkAppearanceInput["cardShadow"],
                        )
                      }
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    >
                      <option value="none">Sem sombra</option>
                      <option value="soft">Suave</option>
                      <option value="medium">Média</option>
                    </select>
                  </div>
                </div>
              </details>

              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Inputs
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["inputBackgroundColor", "Fundo do input"],
                      ["inputTextColor", "Texto do input"],
                      ["inputBorderColor", "Borda do input"],
                      ["inputFocusColor", "Cor de foco"],
                      ["inputPlaceholderColor", "Placeholder"],
                    ] as const
                  ).map(([key, label]) => (
                    <ColorField
                      key={key}
                      id={key}
                      label={label}
                      value={form.appearance[key]}
                      defaultValue={DEFAULT_PAYMENT_LINK_APPEARANCE[key]}
                      onChange={(value) => setAppearance(key, value)}
                    />
                  ))}
                  <NumberField
                    id="input-radius"
                    label="Border radius"
                    value={form.appearance.inputRadius}
                    min={0}
                    max={28}
                    suffix="px"
                    onChange={(value) => setAppearance("inputRadius", value)}
                  />
                </div>
              </details>

              <details open className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Botões e segurança
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["buttonColor", "Cor do botão"],
                        ["buttonHoverColor", "Hover"],
                        ["buttonTextColor", "Texto do botão"],
                        ["secondaryButtonColor", "Texto secundário"],
                        ["secondaryButtonBackground", "Fundo secundário"],
                        ["secondaryButtonBorderColor", "Borda secundária"],
                      ] as const
                    ).map(([key, label]) => (
                      <ColorField
                        key={key}
                        id={key}
                        label={label}
                        value={form.appearance[key]}
                        defaultValue={DEFAULT_PAYMENT_LINK_APPEARANCE[key]}
                        onChange={(value) => setAppearance(key, value)}
                      />
                    ))}
                    <NumberField
                      id="button-radius"
                      label="Border radius"
                      value={form.appearance.buttonRadius}
                      min={0}
                      max={28}
                      suffix="px"
                      onChange={(value) => setAppearance("buttonRadius", value)}
                    />
                    <NumberField
                      id="button-height"
                      label="Altura"
                      value={form.appearance.buttonHeight}
                      min={40}
                      max={72}
                      suffix="px"
                      onChange={(value) => setAppearance("buttonHeight", value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="button-text">
                      Texto do botão principal
                    </Label>
                    <Input
                      id="button-text"
                      value={form.buttonText}
                      onChange={(event) =>
                        set("buttonText", event.target.value)
                      }
                      placeholder="Continuar para pagamento"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="secondary-button-text">
                      Texto do botão secundário
                    </Label>
                    <Input
                      id="secondary-button-text"
                      value={form.appearance.secondaryButtonText}
                      onChange={(event) =>
                        setAppearance("secondaryButtonText", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="security-text">Texto de segurança</Label>
                    <Input
                      id="security-text"
                      value={form.appearance.securityText}
                      onChange={(event) =>
                        setAppearance("securityText", event.target.value)
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Use apenas afirmações verdadeiras sobre o seu processo de
                      pagamento.
                    </p>
                  </div>
                </div>
              </details>
            </Section>

            <Section
              icon={Globe}
              title="Domínio e endereço"
              description="A URL é gerada pelo Infinity, no seu domínio."
            >
              <div className="space-y-1.5">
                <Label htmlFor="domain">Domínio do link</Label>
                <select
                  id="domain"
                  value={form.domainId}
                  onChange={(e) => set("domainId", e.target.value)}
                  className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  <option value="">
                    Domínio principal ({appOrigin.replace(/^https?:\/\//, "")})
                  </option>
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.hostname}
                      {domain.isVerified ? " · verificado" : " · pendente"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Endereço personalizado (opcional)</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) =>
                    set(
                      "slug",
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  placeholder="pedido-victor-001"
                  className="font-mono text-xs"
                />
                <p className="text-muted-foreground text-xs break-all">
                  {domainOrigin}/pagar/
                  <span className="text-foreground font-medium">
                    {form.slug || "gerado automaticamente"}
                  </span>
                </p>
                {form.slug ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `${domainOrigin}/pagar/${form.slug}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Abrir pré-visualização publicada
                  </Button>
                ) : null}
              </div>
            </Section>

            <Section
              icon={Check}
              title="Página de sucesso"
              description="Conteúdo mostrado somente depois da confirmação real do pagamento."
            >
              <div className="space-y-1.5">
                <Label htmlFor="success-title">Título</Label>
                <Input
                  id="success-title"
                  value={form.success.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      success: {
                        ...current.success,
                        title: event.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="success-description">Descrição</Label>
                <Textarea
                  id="success-description"
                  value={form.success.description}
                  rows={2}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      success: {
                        ...current.success,
                        description: event.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="success-button">Texto do botão final</Label>
                  <Input
                    id="success-button"
                    value={form.success.buttonText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        success: {
                          ...current.success,
                          buttonText: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="success-url">URL de redirecionamento</Label>
                  <Input
                    id="success-url"
                    value={form.success.redirectUrl}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        success: {
                          ...current.success,
                          redirectUrl: event.target.value,
                        },
                      }))
                    }
                    placeholder="https://suaempresa.pt/obrigado"
                  />
                </div>
              </div>
            </Section>

            <Section
              icon={Globe}
              title="Título do navegador e SEO"
              description="Páginas de pagamento são noindex, nofollow por padrão."
            >
              <div className="space-y-1.5">
                <Label htmlFor="browser-title">Título da aba</Label>
                <Input
                  id="browser-title"
                  value={form.seo.browserTitle}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      seo: { ...current.seo, browserTitle: event.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seo-description">Descrição</Label>
                <Textarea
                  id="seo-description"
                  value={form.seo.description}
                  rows={2}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      seo: { ...current.seo, description: event.target.value },
                    }))
                  }
                />
              </div>
            </Section>

            <Section
              icon={Settings2}
              title="Validade e limites"
              description="Controle até quando e quantas vezes o link pode ser pago."
            >
              <div className="space-y-1.5">
                <Label htmlFor="expiration">Expiração do link</Label>
                <select
                  id="expiration"
                  value={form.expiration}
                  onChange={(e) =>
                    set(
                      "expiration",
                      e.target.value as LinkFormState["expiration"],
                    )
                  }
                  className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  <option value="never">Nunca</option>
                  <option value="1h">1 hora</option>
                  <option value="24h">24 horas</option>
                  <option value="3d">3 dias</option>
                  <option value="7d">7 dias</option>
                  <option value="custom">Data personalizada</option>
                </select>
              </div>
              {form.expiration === "custom" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="expires-at">Expira em</Label>
                  <Input
                    id="expires-at"
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => set("expiresAt", e.target.value)}
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="usage-limit">Limite de pagamentos</Label>
                <select
                  id="usage-limit"
                  value={form.usageLimit}
                  onChange={(e) =>
                    set(
                      "usageLimit",
                      e.target.value as LinkFormState["usageLimit"],
                    )
                  }
                  className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  <option value="unlimited">Ilimitado</option>
                  <option value="single">Apenas 1 pagamento</option>
                  <option value="custom">Quantidade personalizada</option>
                </select>
              </div>
              {form.usageLimit === "custom" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="max-payments">Quantos pagamentos</Label>
                  <Input
                    id="max-payments"
                    type="number"
                    min={1}
                    max={10000}
                    value={form.maxPayments}
                    onChange={(e) =>
                      set(
                        "maxPayments",
                        Math.max(1, Number(e.target.value) || 1),
                      )
                    }
                  />
                </div>
              ) : null}

              <ToggleRow
                id="meta-pixel"
                label="Enviar eventos para Pixel / API de conversão"
                hint="PageView no acesso, InitiateCheckout na interação e Purchase somente após confirmação."
                checked={form.metaPixelEnabled}
                onCheckedChange={(checked) => set("metaPixelEnabled", checked)}
              />
              {form.metaPixelEnabled ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-medium">Integrações vinculadas</p>
                  {pixels.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Nenhuma integração ativa. Configure-a na área Pixel.
                    </p>
                  ) : (
                    pixels.map((pixel) => {
                      const checked = form.pixelIds.includes(pixel.id);
                      return (
                        <label
                          key={pixel.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              set(
                                "pixelIds",
                                event.target.checked
                                  ? [...form.pixelIds, pixel.id]
                                  : form.pixelIds.filter(
                                      (id) => id !== pixel.id,
                                    ),
                              )
                            }
                            className="size-4"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {pixel.name}
                            </span>
                            <span className="text-muted-foreground block text-[11px]">
                              {pixel.type.replaceAll("_", " ")}
                              {pixel.publicId
                                ? ` · ${pixel.publicId}`
                                : " · servidor"}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                  <p className="text-muted-foreground text-[11px]">
                    Sem seleção manual, o link usa as integrações globais ativas
                    do workspace.
                  </p>
                </div>
              ) : null}
            </Section>
          </div>

          {/* Preview: acompanha a rolagem no desktop, fica abaixo no mobile. */}
          <div className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Pré-visualização
              </span>
              <div
                role="group"
                aria-label="Tamanho da pré-visualização"
                className="bg-muted inline-flex rounded-md p-0.5"
              >
                {(
                  [
                    ["desktop", Monitor, "Desktop"],
                    ["mobile", Smartphone, "Mobile"],
                  ] as const
                ).map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    aria-pressed={viewport === value}
                    onClick={() => setViewport(value)}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1 transition-colors duration-150",
                      viewport === value
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border">
              <div
                className={cn(
                  "mx-auto transition-[max-width] duration-200",
                  viewport === "mobile" ? "max-w-[390px]" : "max-w-none",
                )}
              >
                <CheckoutCard link={previewLink} disabled />
              </div>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Esta é a mesma página que o cliente vê — o preview usa o
              componente da rota pública.
            </p>
          </div>
        </div>
      </form>

      <Sheet open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-none gap-0 p-0 sm:max-w-none lg:hidden"
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Pré-visualização</SheetTitle>
            <SheetDescription>
              Atualizada em tempo real com as configurações do link.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CheckoutCard link={previewLink} disabled />
          </div>
        </SheetContent>
      </Sheet>

      <ShareDialog
        open={createdUrl !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedUrl(null);
            router.push("/financeiro/links-de-pagamento");
            router.refresh();
          }
        }}
        url={createdUrl ?? ""}
        title={form.name || form.title}
        justCreated
      />
    </>
  );
}
