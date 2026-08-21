"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Globe,
  History,
  Link2,
  Package,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogoDropzone } from "@/components/logo-dropzone";
import type { ProductOption } from "@/features/products/queries";
import type { DomainRow } from "@/features/domains/queries";

import {
  detachProductAction,
  pauseLandingPageAction,
  publishLandingPageAction,
  restoreLandingVersionAction,
  rotatePreviewTokenAction,
  updateLandingSettingsAction,
  type LandingActionResult,
} from "../actions";
import { deployLandingPageAction } from "../deployment/actions";
import { validateForPublish } from "../publish-rules";
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
} from "../defaults";
import type {
  LandingEventPoint,
  LandingPageDetail,
  LandingSourceRow,
  LandingVersionRow,
} from "../queries";
import { DEPLOYMENT_STATUS_LABEL, resolveLandingPublicUrl } from "../types";
import { CopyUrlButton } from "../panel/page-actions";
import { StatusBadge } from "../panel/landing-pages-view";
import type { BuilderState } from "./use-builder-state";

const selectClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-b p-5 last:border-b-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Produto e informações
// ---------------------------------------------------------------------------

export function ProductPanel({
  page,
  products,
  appUrl,
}: {
  page: LandingPageDetail;
  products: ProductOption[];
  appUrl: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    LandingActionResult | null,
    FormData
  >(updateLandingSettingsAction, null);
  const [slug, setSlug] = React.useState(page.slug);
  const [sync, setSync] = React.useState(page.productSync);
  const [logoUrl, setLogoUrl] = React.useState(page.logoUrl);
  const [faviconUrl, setFaviconUrl] = React.useState(page.faviconUrl);
  const isExternal = page.deployment.provider === "vercel";
  const publicUrl = resolveLandingPublicUrl({ ...page, slug }, appUrl);

  React.useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="mx-auto max-w-3xl">
      <form action={formAction}>
        <input type="hidden" name="id" value={page.id} />

        <PanelSection
          title="Identificação"
          description="Nome interno, nome público e endereço da página."
        >
          {state?.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {state?.ok && state.message ? (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-name">Nome de controlo interno</Label>
              <Input
                id="settings-name"
                name="name"
                defaultValue={page.name}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-public-name">Nome público</Label>
              <Input
                id="settings-public-name"
                name="publicName"
                defaultValue={page.publicName}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="settings-slug">Endereço</Label>
              <Input
                id="settings-slug"
                name="slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                readOnly={isExternal}
                required
              />
              <p className="text-muted-foreground font-mono text-xs break-all">
                {publicUrl}
              </p>
              {isExternal ? (
                <p className="text-muted-foreground text-xs">
                  O endereço desta página vem do projeto externo da Vercel e não
                  pode ser alterado neste editor.
                </p>
              ) : null}
              {page.publishedAt ? (
                <p className="text-muted-foreground text-xs">
                  Mudar o endereço quebra os links já usados em anúncios.
                </p>
              ) : null}
            </div>
          </div>
        </PanelSection>

        <PanelSection
          title="Produto vinculado"
          description="De onde vêm nome, fotos, preço, variações e o checkout."
        >
          <div className="space-y-1.5">
            <Label htmlFor="settings-product">Produto</Label>
            <select
              id="settings-product"
              name="productId"
              className={selectClass}
              defaultValue={page.productId ?? ""}
            >
              <option value="">— Sem produto vinculado —</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label htmlFor="settings-sync">
                Manter sincronizado com o catálogo
              </Label>
              <p className="text-muted-foreground text-xs">
                Ligado, alterar preço ou fotos no catálogo atualiza a página no
                ar sem republicar. Desligado, a página usa a cópia congelada.
              </p>
            </div>
            <Switch
              id="settings-sync"
              name="productSync"
              checked={sync}
              onCheckedChange={setSync}
            />
          </div>

          {page.product ? (
            <div className="rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Package className="size-4" /> Dados importados
              </p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <Detail label="Nome" value={page.product.name} />
                <Detail
                  label="Preço"
                  value={`${(page.product.priceCents / 100).toFixed(2)} ${page.product.currency}`}
                />
                <Detail
                  label="Imagens"
                  value={String(page.product.gallery.length)}
                />
                <Detail
                  label="Variações"
                  value={String(page.product.variants.length)}
                />
                <Detail
                  label="Estoque"
                  value={
                    page.product.trackInventory
                      ? String(page.product.stockQuantity)
                      : "Não controlado"
                  }
                />
                <Detail
                  label="Checkout"
                  value={`/checkout/${page.product.checkoutSlug}`}
                />
              </dl>

              {page.product.variants.length > 0 ? (
                <div className="mt-4 border-t pt-3">
                  <p className="text-sm font-semibold">
                    {page.product.variantOptionName} importada(s)
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Preço, estoque e fotos de cada opção vêm do catálogo. Para
                    alterar, edite o produto em Catálogo → Variações.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {page.product.variants.map((variant) => (
                      <li
                        key={variant.id}
                        className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                      >
                        {variant.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={variant.thumbnailUrl}
                            alt=""
                            className="size-6 rounded object-cover"
                          />
                        ) : variant.hexColor ? (
                          <span
                            aria-hidden
                            className="size-3.5 rounded-full border"
                            style={{ backgroundColor: variant.hexColor }}
                          />
                        ) : null}
                        <span className="font-medium">{variant.name}</span>
                        <span className="text-muted-foreground">
                          {(
                            (variant.priceCents ?? page.product!.priceCents) /
                            100
                          ).toFixed(2)}{" "}
                          {page.product!.currency}
                        </span>
                        {variant.isDefault ? (
                          <span className="text-primary font-semibold">
                            padrão
                          </span>
                        ) : null}
                        {variant.trackInventory &&
                        variant.stockQuantity <= 0 ? (
                          <span className="text-destructive font-semibold">
                            esgotada
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <Alert>
              <AlertCircle />
              <AlertDescription>
                Sem produto vinculado, o botão de compra não tem o que vender e
                a página não pode ser publicada com ele.
              </AlertDescription>
            </Alert>
          )}
        </PanelSection>

        <PanelSection title="Idioma, país e marca">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="settings-language">Idioma</Label>
              <select
                id="settings-language"
                name="language"
                className={selectClass}
                defaultValue={page.language}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-country">País</Label>
              <select
                id="settings-country"
                name="country"
                className={selectClass}
                defaultValue={page.country}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-currency">Moeda</Label>
              <select
                id="settings-currency"
                name="currency"
                className={selectClass}
                defaultValue={page.currency}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <input type="hidden" name="logoUrl" value={logoUrl} />
              <LogoDropzone
                id="settings-logo"
                label="Logo do cabeçalho"
                value={logoUrl}
                onChange={setLogoUrl}
              />
            </div>
            <div className="space-y-1.5">
              <input type="hidden" name="faviconUrl" value={faviconUrl} />
              <LogoDropzone
                id="settings-favicon"
                label="Favicon"
                value={faviconUrl}
                onChange={setFaviconUrl}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              Guardar informações
            </Button>
            {page.productId && page.productSync ? (
              <DetachButton pageId={page.id} />
            ) : null}
          </div>
          {isExternal ? (
            <p className="text-muted-foreground text-xs">
              Depois de guardar o logo, abra a aba Publicação e clique em
              “Republicar na Vercel” para atualizar o site no ar.
            </p>
          ) : null}
        </PanelSection>
      </form>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function DetachButton({ pageId }: { pageId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const formData = new FormData();
        formData.set("id", pageId);
        const result = await detachProductAction(formData);
        setPending(false);
        if (result.ok) {
          toast.success(result.message ?? "Cópia criada.");
          router.refresh();
        } else {
          toast.error(result.error ?? "Não foi possível criar a cópia.");
        }
      }}
    >
      <Unlink /> Criar cópia personalizável
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Publicação
// ---------------------------------------------------------------------------

type PublishPanelProps = {
  page: LandingPageDetail;
  state: BuilderState;
  appUrl: string;
};

export function PublishPanel(props: PublishPanelProps) {
  return props.page.deployment.provider === "vercel" ? (
    <ExternalPublishPanel page={props.page} appUrl={props.appUrl} />
  ) : (
    <InternalPublishPanel {...props} />
  );
}

function ExternalPublishPanel({
  page,
  appUrl,
}: Pick<PublishPanelProps, "page" | "appUrl">) {
  const router = useRouter();
  const [result, formAction, pending] = useActionState<
    LandingActionResult | null,
    FormData
  >(async (_previous, formData) => deployLandingPageAction(formData), null);
  const publicUrl = resolveLandingPublicUrl(page, appUrl);

  React.useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Publicação externa"
        description="Esta landing page é um site estático próprio hospedado na Vercel."
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={page.status} />
          <Badge variant="secondary">
            {DEPLOYMENT_STATUS_LABEL[page.deployment.status]}
          </Badge>
          {page.hasUnpublishedChanges && page.deployment.url ? (
            <Badge variant="warning">Há alterações por publicar</Badge>
          ) : null}
        </div>

        {page.deployment.updatedAt ? (
          <p className="text-muted-foreground text-sm">
            Último envio em {formatDateTime(page.deployment.updatedAt, "pt-PT")}
            .
          </p>
        ) : null}

        <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {publicUrl}
          </code>
          <CopyUrlButton url={publicUrl} variant="outline" />
          {page.deployment.url ? (
            <Button size="sm" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir página
              </a>
            </Button>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="Logo e identidade">
        {page.logoUrl ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertDescription>
              O logo está guardado. Ao republicar, ele será aplicado no
              cabeçalho do site, inclusive no celular.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertCircle />
            <AlertDescription>
              Adicione o logo na aba Produto e guarde as informações antes de
              republicar.
            </AlertDescription>
          </Alert>
        )}
      </PanelSection>

      <PanelSection
        title={page.deployment.url ? "Republicar" : "Publicar"}
        description="O painel enviará os arquivos e a identidade atualizada para o projeto da Vercel."
      >
        {result?.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ) : null}
        {result?.ok ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction}>
          <input type="hidden" name="id" value={page.id} />
          <Button type="submit" loading={pending}>
            <CloudUpload />
            {page.deployment.url
              ? "Republicar na Vercel"
              : "Publicar na Vercel"}
          </Button>
        </form>
      </PanelSection>

      {page.deployment.log ? (
        <PanelSection title="Último registro técnico">
          <pre className="bg-muted max-h-64 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
            {page.deployment.log}
          </pre>
        </PanelSection>
      ) : null}
    </div>
  );
}

function InternalPublishPanel({ page, state, appUrl }: PublishPanelProps) {
  const router = useRouter();
  const [result, formAction, pending] = useActionState<
    LandingActionResult | null,
    FormData
  >(publishLandingPageAction, null);
  const [scheduled, setScheduled] = React.useState("");
  const [previewToken, setPreviewToken] = React.useState(
    page.previewToken ?? "",
  );

  const publicUrl = `${appUrl}/lp/${page.slug}`;
  const previewUrl = previewToken ? `${publicUrl}?preview=${previewToken}` : "";

  const issues = React.useMemo(
    () =>
      validateForPublish({
        slug: page.slug,
        productId: page.productId,
        product: page.product,
        content: state.doc.content,
      }),
    [page.slug, page.productId, page.product, state.doc.content],
  );

  React.useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection title="Estado atual">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={page.status} />
          {page.publishedVersion ? (
            <Badge variant="secondary">
              Versão {page.publishedVersion} no ar
            </Badge>
          ) : null}
          {page.hasUnpublishedChanges && page.publishedVersion ? (
            <Badge variant="warning">Há alterações por publicar</Badge>
          ) : null}
        </div>

        {page.publishedAt ? (
          <p className="text-muted-foreground text-sm">
            Publicada em {formatDateTime(page.publishedAt, "pt-PT")}.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ainda não publicada — o endereço público responde 404 até à primeira
            publicação.
          </p>
        )}

        <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {publicUrl}
          </code>
          <CopyUrlButton url={publicUrl} variant="outline" />
          {page.status === "published" ? (
            <Button size="sm" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir página
              </a>
            </Button>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection
        title="Verificações antes de publicar"
        description="Publicar só é permitido quando todos os pontos estiverem resolvidos."
      >
        {issues.length === 0 ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertDescription>
              Tudo pronto: há blocos visíveis, o produto está vinculado e o
              checkout resolve.
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.field}>
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{issue.message}</AlertDescription>
                </Alert>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection
        title="Publicar"
        description="Publicar grava uma versão imutável e coloca-a no ar. Não é preciso novo deploy da aplicação."
      >
        {result?.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ) : null}
        {result?.ok ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={page.id} />
          <input type="hidden" name="scheduledPublishAt" value={scheduled} />

          <div className="space-y-1.5">
            <Label htmlFor="schedule">Agendar (opcional)</Label>
            <Input
              id="schedule"
              type="datetime-local"
              value={scheduled}
              onChange={(event) => setScheduled(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Com data futura, a versão fica guardada e só entra no ar a partir
              dela. Vazio publica já.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              loading={pending}
              disabled={issues.length > 0}
            >
              <Rocket />
              {page.publishedVersion ? "Republicar" : "Publicar página"}
            </Button>

            <PauseButton pageId={page.id} paused={page.status === "paused"} />
          </div>
        </form>
      </PanelSection>

      <PanelSection
        title="Pré-visualização privada"
        description="Um link secreto que mostra o rascunho atual, sem publicar e sem ser indexado."
      >
        {previewUrl ? (
          <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {previewUrl}
            </code>
            <CopyUrlButton url={previewUrl} variant="outline" />
            <Button size="sm" asChild>
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ainda não há link de pré-visualização para esta página.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            const formData = new FormData();
            formData.set("id", page.id);
            const rotated = await rotatePreviewTokenAction(formData);
            if (rotated.ok) {
              toast.success(
                "Novo link gerado. O anterior deixou de funcionar.",
              );
              router.refresh();
              setPreviewToken("");
            } else {
              toast.error(rotated.error ?? "Não foi possível gerar o link.");
            }
          }}
        >
          <RefreshCw /> Gerar novo link
        </Button>
      </PanelSection>

      <PanelSection
        title="Sobre o deploy"
        description="Como esta página chega ao ar."
      >
        <Alert>
          <ShieldCheck />
          <AlertDescription>
            <strong>Publicar</strong> grava a versão no banco e revalida o cache
            da rota pública — leva segundos e não gera build. Um{" "}
            <strong>deploy da aplicação</strong> na Vercel só é necessário
            quando o código do próprio construtor muda, o que acontece por{" "}
            <code>git push</code> no repositório ligado ao projeto.
          </AlertDescription>
        </Alert>
      </PanelSection>
    </div>
  );
}

function PauseButton({ pageId, paused }: { pageId: string; paused: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const formData = new FormData();
        formData.set("id", pageId);
        if (paused) formData.set("resume", "true");
        const result = await pauseLandingPageAction(formData);
        setPending(false);
        if (result.ok) {
          toast.success(result.message ?? "Feito.");
          router.refresh();
        } else {
          toast.error(result.error ?? "Não foi possível concluir.");
        }
      }}
    >
      {paused ? (
        <>
          <Play /> Retomar página
        </>
      ) : (
        <>
          <Pause /> Pausar página
        </>
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Domínio
// ---------------------------------------------------------------------------

export function DomainPanel({
  page,
  domains,
  appUrl,
}: {
  page: LandingPageDetail;
  domains: DomainRow[];
  appUrl: string;
}) {
  const publicUrl = `${appUrl}/lp/${page.slug}`;

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Endereço padrão"
        description="Funciona desde a primeira publicação, sem configuração."
      >
        <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {publicUrl}
          </code>
          <CopyUrlButton url={publicUrl} variant="outline" />
        </div>
      </PanelSection>

      <PanelSection
        title="Domínios próprios"
        description="Domínios apontados para esta aplicação. Um domínio verificado serve as páginas públicas sem expor o painel."
      >
        {domains.length === 0 ? (
          <Alert>
            <Globe />
            <AlertDescription>
              Ainda não há domínios próprios. Adicione um em Landing pages →
              Domínios para anunciar num endereço da sua marca.
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="space-y-2">
            {domains.map((domain) => (
              <li
                key={domain.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{domain.hostname}</p>
                  <p className="text-muted-foreground text-xs">
                    {domain.productName
                      ? `Serve o produto ${domain.productName} na raiz`
                      : "Serve apenas as rotas públicas"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {domain.isVerified ? (
                    <Badge variant="success">Verificado · SSL ativo</Badge>
                  ) : (
                    <Badge variant="warning">A aguardar verificação</Badge>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <a
                      href={`https://${domain.hostname}/lp/${page.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Link2 /> Testar
                    </a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button variant="outline" asChild>
          <Link href="/landing-pages/dominios">
            <Globe /> Gerir domínios e ver instruções de DNS
          </Link>
        </Button>
      </PanelSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

export function HistoryPanel({
  page,
  versions,
}: {
  page: LandingPageDetail;
  versions: LandingVersionRow[];
}) {
  const router = useRouter();
  const [pendingVersion, setPendingVersion] = React.useState<number | null>(
    null,
  );

  if (versions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-5">
        <Alert>
          <History />
          <AlertDescription>
            O histórico começa na primeira publicação. Cada publicação guarda
            uma cópia imutável da página, que pode ser restaurada depois.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Histórico de publicações"
        description="Restaurar traz a versão para o rascunho — a página no ar só muda quando publicar de novo."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Versão</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((version) => (
              <TableRow key={version.id}>
                <TableCell className="font-medium">
                  v{version.version}
                  {version.isPublished ? (
                    <Badge variant="success" className="ml-2">
                      No ar
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDateTime(version.createdAt, "pt-PT")}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {version.note ?? "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={pendingVersion === version.version}
                    onClick={async () => {
                      setPendingVersion(version.version);
                      const formData = new FormData();
                      formData.set("id", page.id);
                      formData.set("version", String(version.version));
                      const result =
                        await restoreLandingVersionAction(formData);
                      setPendingVersion(null);
                      if (result.ok) {
                        toast.success(result.message ?? "Versão restaurada.");
                        router.refresh();
                      } else {
                        toast.error(
                          result.error ?? "Não foi possível restaurar.",
                        );
                      }
                    }}
                  >
                    Restaurar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export function MetricsPanel({
  page,
  series,
  sources,
}: {
  page: LandingPageDetail;
  series: LandingEventPoint[];
  sources: LandingSourceRow[];
}) {
  const metrics = page.metrics;

  const cards = [
    { label: "Visitas", value: metrics.views },
    { label: "Visitantes únicos", value: metrics.uniqueVisitors },
    { label: "Cliques no botão", value: metrics.ctaClicks },
    { label: "Idas ao checkout", value: metrics.checkouts },
    { label: "Vendas pagas", value: metrics.purchases },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PanelSection
        title="Resumo"
        description="Visitas e cliques vêm dos eventos da página; as vendas vêm dos pedidos pagos, não do pixel."
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">{card.label}</p>
              <p className="text-xl font-bold">{formatNumber(card.value)}</p>
            </div>
          ))}
        </div>
        <p className="text-sm">
          Taxa de conversão:{" "}
          <strong>{metrics.conversionRate.toFixed(2)}%</strong>
        </p>
      </PanelSection>

      <PanelSection title="Últimos 30 dias">
        {series.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ainda sem eventos registados. Os dados aparecem depois das primeiras
            visitas à página publicada.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis dataKey="day" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} allowDecimals={false} />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="views"
                  name="Visitas"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="ctaClicks"
                  name="Cliques"
                  stroke="var(--color-info)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="checkouts"
                  name="Checkouts"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </PanelSection>

      <PanelSection title="Origem do tráfego">
        {sources.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem origens registadas ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Visitas</TableHead>
                <TableHead className="text-right">Checkouts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.source}>
                  <TableCell className="font-medium">{source.source}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(source.visits)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(source.checkouts)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelSection>

      {page.scheduledPublishAt ? (
        <PanelSection title="Agendamento">
          <p className="flex items-center gap-2 text-sm">
            <CalendarClock className="size-4" />
            Publicação agendada para{" "}
            {formatDateTime(page.scheduledPublishAt, "pt-PT")}.
          </p>
        </PanelSection>
      ) : null}
    </div>
  );
}
