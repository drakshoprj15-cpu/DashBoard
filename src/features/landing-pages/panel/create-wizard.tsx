"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Package,
  Palette,
  Rocket,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogoDropzone } from "@/components/logo-dropzone";
import type { ProductOption } from "@/features/products/queries";

import {
  createLandingPageAction,
  type LandingActionResult,
} from "../actions";
import { LANDING_TEMPLATES } from "../templates";
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  DEFAULT_THEME,
  LANGUAGE_OPTIONS,
} from "../defaults";
import { slugifyLanding } from "../sanitize";

const STEPS = [
  { id: 1, label: "Informações", icon: Sparkles },
  { id: 2, label: "Produto", icon: Package },
  { id: 3, label: "Tema", icon: Palette },
  { id: 4, label: "Modelo", icon: Rocket },
] as const;

const THEME_FIELDS = [
  { key: "headerBackground", label: "Fundo do cabeçalho" },
  { key: "headerTextColor", label: "Texto do cabeçalho" },
  { key: "buttonColor", label: "Fundo dos botões" },
  { key: "buttonTextColor", label: "Texto dos botões" },
  { key: "primaryColor", label: "Cor de destaque" },
  { key: "variantSelectedColor", label: "Variação selecionada" },
  { key: "footerBackground", label: "Fundo do rodapé" },
  { key: "footerTextColor", label: "Texto do rodapé" },
] as const;

const selectClass =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

export function CreateLandingWizard({
  products,
  appUrl,
  trigger,
}: {
  products: ProductOption[];
  appUrl: string;
  /** Elemento que abre o assistente. Sem ele, usa o botão principal. */
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [productId, setProductId] = React.useState("");
  const [template, setTemplate] = React.useState(LANDING_TEMPLATES[0].id);
  const [logoUrl, setLogoUrl] = React.useState("");
  const [faviconUrl, setFaviconUrl] = React.useState("");
  const [colors, setColors] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      THEME_FIELDS.map((field) => [
        field.key,
        DEFAULT_THEME[field.key as keyof typeof DEFAULT_THEME] as string,
      ]),
    ),
  );

  const [state, formAction, pending] = useActionState<
    LandingActionResult | null,
    FormData
  >(createLandingPageAction, null);

  const effectiveSlug = slugTouched ? slugifyLanding(slug) : slugifyLanding(name);

  const createdId = state?.ok ? state.id : undefined;

  // Criada com sucesso: leva direto ao editor, que é o próximo passo natural.
  // O diálogo fecha por derivação do estado, não por setState no efeito.
  React.useEffect(() => {
    if (createdId) router.push(`/landing-pages/${createdId}`);
  }, [createdId, router]);

  function reset() {
    setStep(1);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setProductId("");
    setTemplate(LANDING_TEMPLATES[0].id);
    setLogoUrl("");
    setFaviconUrl("");
  }

  const canAdvance =
    step === 1 ? name.trim().length >= 2 && effectiveSlug.length >= 3 : true;

  return (
    <Dialog
      open={open && !createdId}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button>
            <Rocket /> Criar landing page
          </Button>
        )}
      </span>

      <DialogContent className="max-w-3xl" showClose={!pending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Rocket className="size-5 text-primary" /> Nova landing page
          </DialogTitle>
          <DialogDescription>
            Quatro passos até uma página pronta para receber tráfego.
          </DialogDescription>
        </DialogHeader>

        {/* Trilho de etapas */}
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((item) => {
            const done = step > item.id;
            const current = step === item.id;
            return (
              <li key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(item.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    current && "border-primary bg-primary/10 text-primary",
                    done && "border-emerald-500/40 text-emerald-600",
                    !current && !done && "text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : <item.icon className="size-3.5" />}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ol>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          {/* Campos que precisam viajar mesmo fora da etapa visível */}
          <input type="hidden" name="slug" value={effectiveSlug} />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="template" value={template} />
          {THEME_FIELDS.map((field) => (
            <input
              key={field.key}
              type="hidden"
              name={field.key}
              value={colors[field.key]}
            />
          ))}

          <div className="min-h-[320px] flex-1 overflow-y-auto pr-1">
            {state?.error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle />
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="lp-name">Nome de controlo interno</Label>
                  <Input
                    id="lp-name"
                    name="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ex.: LP Verão — TikTok"
                    autoFocus
                  />
                  <p className="text-muted-foreground text-xs">
                    Só para o seu controlo — o cliente nunca vê este nome.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lp-public-name">Nome público da página</Label>
                  <Input
                    id="lp-public-name"
                    name="publicName"
                    placeholder="Ex.: A Minha Loja"
                  />
                  <p className="text-muted-foreground text-xs">
                    Aparece no cabeçalho e no rodapé.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lp-slug">Endereço (slug)</Label>
                  <Input
                    id="lp-slug"
                    value={slugTouched ? slug : effectiveSlug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setSlug(event.target.value);
                    }}
                    placeholder="lp-verao-tiktok"
                  />
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {appUrl}/lp/{effectiveSlug || "…"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lp-language">Idioma</Label>
                  <select id="lp-language" name="language" className={selectClass}>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lp-country">País</Label>
                  <select id="lp-country" name="country" className={selectClass}>
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lp-currency">Moeda</Label>
                  <select id="lp-currency" name="currency" className={selectClass}>
                    {CURRENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <input type="hidden" name="logoUrl" value={logoUrl} />
                  <LogoDropzone
                    id="lp-logo"
                    label="Logo do cabeçalho"
                    value={logoUrl}
                    onChange={setLogoUrl}
                  />
                  <p className="text-muted-foreground text-xs">
                    Ideal: ~240×80 px, PNG ou SVG com fundo transparente.
                  </p>
                </div>

                <div className="space-y-2">
                  <input type="hidden" name="faviconUrl" value={faviconUrl} />
                  <LogoDropzone
                    id="lp-favicon"
                    label="Favicon"
                    value={faviconUrl}
                    onChange={setFaviconUrl}
                  />
                  <p className="text-muted-foreground text-xs">
                    Quadrado, 64×64 px ou maior. Aparece no separador do
                    navegador.
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                {products.length === 0 ? (
                  <Alert>
                    <AlertCircle />
                    <AlertDescription>
                      Nenhum produto cadastrado. Pode criar a página sem produto,
                      mas o botão de compra só funciona depois de vincular um
                      produto em Catálogo → Produtos.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="lp-product">Produto base</Label>
                      <select
                        id="lp-product"
                        className={selectClass}
                        value={productId}
                        onChange={(event) => setProductId(event.target.value)}
                      >
                        <option value="">— Sem produto vinculado —</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-muted-foreground text-xs">
                        Nome, fotos, preço, variações, descrição e checkout são
                        importados deste produto.
                      </p>
                    </div>

                    <fieldset className="space-y-2 rounded-lg border p-4">
                      <legend className="px-1 text-sm font-medium">
                        Como tratar os dados do produto
                      </legend>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="productSync"
                          value="on"
                          defaultChecked
                          className="accent-primary mt-1 size-4"
                        />
                        <span>
                          <strong>Manter sincronizado com o catálogo</strong>
                          <span className="text-muted-foreground block text-xs">
                            Alterar o preço no catálogo atualiza a página no ar,
                            sem republicar.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="productSync"
                          value="off"
                          className="accent-primary mt-1 size-4"
                        />
                        <span>
                          <strong>Criar uma cópia só para esta página</strong>
                          <span className="text-muted-foreground block text-xs">
                            A página congela os dados atuais. Editar aqui nunca
                            mexe no produto do catálogo.
                          </span>
                        </span>
                      </label>
                    </fieldset>
                  </>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {THEME_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`color-${field.key}`}>{field.label}</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`color-${field.key}`}
                          type="color"
                          value={colors[field.key]}
                          onChange={(event) =>
                            setColors((prev) => ({
                              ...prev,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="size-9 shrink-0 cursor-pointer rounded border"
                          aria-label={field.label}
                        />
                        <Input
                          value={colors[field.key]}
                          onChange={(event) =>
                            setColors((prev) => ({
                              ...prev,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="font-mono text-xs uppercase"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  Tipografia, arredondamento, sombras e largura ficam na aba
                  Design do editor, com prévia em tempo real.
                </p>
              </div>
            )}

            {step === 4 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {LANDING_TEMPLATES.map((item) => {
                  const selected = template === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTemplate(item.id)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground/40",
                      )}
                    >
                      <p className="flex items-center gap-2 font-semibold">
                        {selected && <Check className="text-primary size-4" />}
                        {item.name}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {item.description}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {item.highlights.map((highlight) => (
                          <li
                            key={highlight}
                            className="bg-muted rounded px-1.5 py-0.5 text-[11px]"
                          >
                            {highlight}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={step === 1 || pending}
            >
              <ArrowLeft /> Voltar
            </Button>

            {step < 4 ? (
              <Button
                type="button"
                onClick={() => setStep((current) => Math.min(4, current + 1))}
                disabled={!canAdvance}
              >
                Continuar <ArrowRight />
              </Button>
            ) : (
              <Button type="submit" loading={pending}>
                <Check /> Criar landing page
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
