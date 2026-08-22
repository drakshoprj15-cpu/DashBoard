"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  Link2,
  LoaderCircle,
  Mail,
  Plus,
  Search,
  Send,
  ShoppingCart,
  TestTube,
  UserRound,
  Users,
  WandSparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  sendCampaignAction,
  type EmailActionResult,
} from "@/features/emails/actions";
import { SEGMENTS, type SegmentKey } from "@/features/emails/types";
import type {
  CustomRecipientsResult,
  Recipient,
} from "@/features/emails/segments";
import {
  EMAIL_VARIABLES,
  buildCampaignHtml,
  DEFAULT_CAMPAIGN_TEMPLATE,
  renderCampaignText,
  type CampaignTemplateVars,
  type EmailBrand,
} from "@/features/emails/template";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PREVIEW_VARS: CampaignTemplateVars = {
  nome: "Maria Oliveira",
  primeiroNome: "Maria",
  email: "maria@exemplo.pt",
  produto: "Produto Exemplo",
  pedido: "PED-1234",
  valor: "49,90 €",
  checkoutUrl: "https://loja.exemplo.pt/checkout/pedido",
  lojaUrl: "https://loja.exemplo.pt",
};

function recipientPreviewVars(recipient: Recipient): CampaignTemplateVars {
  return {
    nome: recipient.name,
    primeiroNome: recipient.name.trim().split(/\s+/)[0] || "Cliente",
    email: recipient.email,
    produto: recipient.productName ?? "o seu produto",
    pedido: recipient.orderReference ?? "o seu pedido",
    valor: money(recipient.orderTotalCents, recipient.currency),
    checkoutUrl:
      recipient.checkoutUrl ?? "https://loja.exemplo.pt/checkout/pedido",
    lojaUrl: "https://loja.exemplo.pt",
  };
}

function money(value: number | null, currency: string | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: currency ?? "EUR",
  }).format(value / 100);
}

export function CampaignForm({
  counts,
  resendReady,
  customRecipients,
  customerIdsParam,
  pendingRecipients,
  initialDispatchId,
  brand,
}: {
  counts: Record<string, number>;
  resendReady: boolean;
  customRecipients?: CustomRecipientsResult | null;
  customerIdsParam?: string;
  pendingRecipients: Recipient[];
  initialDispatchId: string;
  brand: EmailBrand;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    EmailActionResult | null,
    FormData
  >(sendCampaignAction, null);
  const hasCustomRecipients = Boolean(
    customRecipients && customRecipients.recipients.length > 0,
  );
  const [segment, setSegment] = React.useState<SegmentKey>(
    hasCustomRecipients ? "custom" : "pending",
  );
  const [submittingMode, setSubmittingMode] = React.useState<"test" | "send">(
    "test",
  );
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<
    string[]
  >(() => (customerIdsParam ?? "").split(",").filter(Boolean));
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customerResults, setCustomerResults] = React.useState<Recipient[]>([]);
  const [searchingCustomers, setSearchingCustomers] = React.useState(false);
  const [customerSearchError, setCustomerSearchError] = React.useState("");
  const [subject, setSubject] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.subject,
  );
  const [preheader, setPreheader] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.preheader,
  );
  const [headerName, setHeaderName] = React.useState<string>(
    brand.name || DEFAULT_CAMPAIGN_TEMPLATE.headerName,
  );
  const [title, setTitle] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.title,
  );
  const [articleName, setArticleName] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.articleName,
  );
  const [body, setBody] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.body,
  );
  const [ctaLabel, setCtaLabel] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.ctaLabel,
  );
  const [ctaUrl, setCtaUrl] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.ctaUrl,
  );
  const [fallbackText, setFallbackText] = React.useState<string>(
    DEFAULT_CAMPAIGN_TEMPLATE.fallbackText,
  );
  const [previewRecipientId, setPreviewRecipientId] = React.useState(
    pendingRecipients[0]?.id ?? "",
  );
  const dispatchId = React.useMemo(
    () => (state ? crypto.randomUUID() : initialDispatchId),
    [initialDispatchId, state],
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.campaignId) router.refresh();
  }, [router, state]);

  React.useEffect(() => {
    const query = customerQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingCustomers(true);
      setCustomerSearchError("");
      try {
        const params = new URLSearchParams({ q: query });
        const response = await fetch(`/api/email-recipients?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Não foi possível buscar clientes.");
        const result = (await response.json()) as {
          recipients: Recipient[];
        };
        setCustomerResults(result.recipients);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCustomerSearchError(
          error instanceof Error
            ? error.message
            : "Não foi possível buscar clientes.",
        );
        setCustomerResults([]);
      } finally {
        if (!controller.signal.aborted) setSearchingCustomers(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [customerQuery]);

  const activeCustomIds = selectedCustomerIds;
  const total =
    segment === "custom" ? activeCustomIds.length : (counts[segment] ?? 0);
  const previewRecipients = React.useMemo(() => {
    const unique = new Map<string, Recipient>();
    for (const recipient of [
      ...pendingRecipients,
      ...(customRecipients?.recipients ?? []),
      ...customerResults,
    ]) {
      unique.set(recipient.id, recipient);
    }
    return Array.from(unique.values());
  }, [customRecipients, customerResults, pendingRecipients]);
  const selectedPreviewRecipient =
    previewRecipients.find(
      (recipient) => recipient.id === previewRecipientId,
    ) ??
    previewRecipients.find((recipient) =>
      selectedCustomerIds.includes(recipient.id),
    ) ??
    previewRecipients[0];
  const previewVars = selectedPreviewRecipient
    ? recipientPreviewVars(selectedPreviewRecipient)
    : PREVIEW_VARS;
  const renderedSubject = renderCampaignText(subject, previewVars);
  const previewHtml = buildCampaignHtml({
    body,
    preheader,
    headerName,
    title,
    articleName,
    ctaLabel,
    ctaUrl,
    fallbackText,
    vars: previewVars,
    brand,
  });

  function selectAllPending() {
    setSelectedCustomerIds([]);
    setSegment("pending");
    if (pendingRecipients[0]) setPreviewRecipientId(pendingRecipients[0].id);
  }

  function toggleRecipient(customerId: string) {
    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    );
    setSegment("custom");
    setPreviewRecipientId(customerId);
  }

  function prepareIndividual(customerId: string) {
    setSelectedCustomerIds([customerId]);
    setSegment("custom");
    setPreviewRecipientId(customerId);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo disparo</CardTitle>
          <CardDescription>
            Escolha os clientes, confira a mensagem e envie primeiro um teste.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-5">
            <input type="hidden" name="dispatchId" value={dispatchId} />
            <input type="hidden" name="segment" value={segment} />
            <input
              type="hidden"
              name="customerIds"
              value={activeCustomIds.join(",")}
            />

            {state?.error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            {state?.ok && state.message && (
              <Alert variant="success">
                <CheckCircle2 />
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Destinatários</Label>
              <button
                type="button"
                onClick={selectAllPending}
                aria-pressed={segment === "pending"}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border p-4 text-left transition-colors",
                  segment === "pending"
                    ? "border-primary bg-primary/5 ring-primary/15 ring-2"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-md">
                  <ShoppingCart className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    Selecionar todos os carrinhos pendentes
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    Inclui apenas clientes elegíveis e personaliza cada e-mail
                    automaticamente.
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant={segment === "pending" ? "success" : "muted"}>
                    {counts.pending ?? 0}
                  </Badge>
                  {segment === "pending" && (
                    <CheckCircle2 className="text-primary size-5" />
                  )}
                </span>
              </button>

              {segment === "pending" && (
                <div className="border-primary/20 bg-primary/5 flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <p className="text-sm">
                    <strong>{counts.pending ?? 0}</strong>{" "}
                    {(counts.pending ?? 0) === 1
                      ? "cliente sera incluido"
                      : "clientes serao incluidos"}{" "}
                    neste disparo.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSegment("custom");
                      setSelectedCustomerIds([]);
                    }}
                  >
                    Selecionar manualmente
                  </Button>
                </div>
              )}

              {hasCustomRecipients && customRecipients && (
                <button
                  type="button"
                  onClick={() => setSegment("custom")}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left transition-colors",
                    segment === "custom"
                      ? "border-primary bg-accent/40"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Users className="size-3.5" aria-hidden="true" />
                      Selecionados em Carrinhos
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      Contatos escolhidos manualmente na tabela de Carrinhos
                    </span>
                  </span>
                  <span className="text-primary text-sm font-bold">
                    {customRecipients.recipients.length}
                  </span>
                </button>
              )}

              <p className="text-muted-foreground pt-2 text-xs font-medium">
                Outros publicos
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SEGMENTS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setSelectedCustomerIds([]);
                      setSegment(item.key);
                    }}
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors",
                      segment === item.key
                        ? "border-primary bg-accent/40"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {item.label}
                      </span>
                      <span className="text-primary text-sm font-bold">
                        {counts[item.key] ?? 0}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {item.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <Label htmlFor="customer-search">
                    Selecao individual (opcional)
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Busque por nome ou e-mail para preparar um disparo
                    individual ou uma seleção manual.
                  </p>
                </div>
                {selectedCustomerIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="info">
                      {selectedCustomerIds.length} selecionado
                      {selectedCustomerIds.length === 1 ? "" : "s"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomerIds([])}
                    >
                      <X /> Limpar
                    </Button>
                  </div>
                )}
              </div>

              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  id="customer-search"
                  type="search"
                  value={customerQuery}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomerQuery(value);
                    if (value.trim().length < 2) {
                      setCustomerResults([]);
                      setCustomerSearchError("");
                      setSearchingCustomers(false);
                    }
                  }}
                  placeholder="Nome ou e-mail do cliente"
                  className="pr-9 pl-9"
                  autoComplete="off"
                />
                {searchingCustomers && (
                  <LoaderCircle
                    className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
                    aria-label="Buscando clientes"
                  />
                )}
              </div>

              {customerSearchError && (
                <p className="text-destructive text-xs" role="alert">
                  {customerSearchError}
                </p>
              )}

              {customerQuery.trim().length >= 2 && !searchingCustomers && (
                <div
                  className="max-h-72 overflow-y-auto rounded-md border"
                  aria-live="polite"
                >
                  {customerResults.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                      Nenhum cliente encontrado.
                    </p>
                  ) : (
                    <div className="divide-border divide-y">
                      {customerResults.map((customer) => {
                        const selected = selectedCustomerIds.includes(
                          customer.id,
                        );
                        return (
                          <div
                            key={customer.id}
                            className="flex items-center gap-3 px-3 py-2.5"
                          >
                            <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                              <UserRound
                                className="text-muted-foreground size-4"
                                aria-hidden="true"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {customer.name}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                {customer.email}
                              </p>
                              {customer.productName && (
                                <p className="text-muted-foreground truncate text-[11px]">
                                  {customer.productName}
                                  {customer.orderReference
                                    ? ` · ${customer.orderReference}`
                                    : ""}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-pressed={selected}
                              onClick={() => toggleRecipient(customer.id)}
                            >
                              {selected ? <Check /> : <Plus />}
                              {selected ? "Adicionado" : "Adicionar"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {pendingRecipients.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <Label>Carrinhos pendentes recentes</Label>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Use o icone de e-mail para preparar um disparo individual.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={segment === "pending" ? "default" : "outline"}
                    size="sm"
                    onClick={selectAllPending}
                  >
                    <Check /> Selecionar todos ({counts.pending ?? 0})
                  </Button>
                </div>
                <div className="divide-border divide-y rounded-md border sm:hidden">
                  {pendingRecipients.map((recipient) => {
                    const selected = selectedCustomerIds.includes(recipient.id);
                    return (
                      <div
                        key={recipient.id}
                        className="flex items-start gap-3 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={segment === "pending" || selected}
                          disabled={segment === "pending"}
                          onChange={() => toggleRecipient(recipient.id)}
                          aria-label={`Selecionar ${recipient.name}`}
                          className="accent-primary mt-1 size-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {recipient.name}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            {recipient.email}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs">
                            {recipient.productName ?? "Produto nao informado"}
                          </p>
                          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-[11px]">
                            <span className="font-mono">
                              {recipient.orderReference ?? "Sem pedido"}
                            </span>
                            <span className="font-semibold">
                              {money(
                                recipient.orderTotalCents,
                                recipient.currency,
                              )}
                            </span>
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Preparar e-mail para ${recipient.name}`}
                              onClick={() => prepareIndividual(recipient.id)}
                            >
                              <Mail />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Preparar envio individual
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto rounded-md border sm:block">
                  <table className="w-full min-w-[660px] text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2 text-left">Sel.</th>
                        <th className="px-3 py-2 text-left">Cliente</th>
                        <th className="px-3 py-2 text-left">Produto</th>
                        <th className="px-3 py-2 text-left">Pedido</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                        <th className="w-12 px-3 py-2">
                          <span className="sr-only">Ação</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                      {pendingRecipients.map((recipient) => {
                        const selected = selectedCustomerIds.includes(
                          recipient.id,
                        );
                        return (
                          <tr key={recipient.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={segment === "pending" || selected}
                                disabled={segment === "pending"}
                                onChange={() => toggleRecipient(recipient.id)}
                                aria-label={`Selecionar ${recipient.name}`}
                                className="accent-primary size-4"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">
                                {recipient.name}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {recipient.email}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {recipient.productName ?? "—"}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {recipient.orderReference ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {money(
                                recipient.orderTotalCents,
                                recipient.currency,
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Preparar e-mail para ${recipient.name}`}
                                    onClick={() =>
                                      prepareIndividual(recipient.id)
                                    }
                                  >
                                    <Mail />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Preparar envio individual
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid items-start gap-6 border-t pt-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(460px,1.1fr)]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <WandSparkles className="text-primary size-4" />
                    <h3 className="text-sm font-semibold">
                      Personalizar e-mail
                    </h3>
                  </div>
                  <Link
                    href="/configuracoes"
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                  >
                    Configurar marca
                  </Link>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto</Label>
                  <Input
                    id="subject"
                    name="subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preheader">Texto de pré-visualização</Label>
                  <Input
                    id="preheader"
                    name="preheader"
                    value={preheader}
                    onChange={(event) => setPreheader(event.target.value)}
                    maxLength={180}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="headerName"
                    className="flex items-center gap-2"
                  >
                    <span
                      className="size-3 rounded-sm bg-[#cc0000]"
                      aria-hidden="true"
                    />
                    Nome no cabeçalho (opcional)
                  </Label>
                  <Input
                    id="headerName"
                    name="headerName"
                    value={headerName}
                    onChange={(event) => setHeaderName(event.target.value)}
                    placeholder="Nome da sua marca"
                    maxLength={80}
                  />
                  {brand.logoUrl && (
                    <p className="text-muted-foreground text-xs">
                      O logo salvo em Configurações substitui este nome no topo.
                      O nome continua no rodapé. Para mostrar texto no
                      cabeçalho, remova o logo da loja em Configurações.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Titulo interno</Label>
                  <Input
                    id="title"
                    name="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={160}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="articleName">Nome do artigo</Label>
                  <Input
                    id="articleName"
                    name="articleName"
                    value={articleName}
                    onChange={(event) => setArticleName(event.target.value)}
                    maxLength={160}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">Mensagem</Label>
                  <textarea
                    id="body"
                    name="body"
                    rows={11}
                    required
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {EMAIL_VARIABLES.map((variable) => (
                      <button
                        key={variable.token}
                        type="button"
                        onClick={() =>
                          setBody(
                            (current) =>
                              `${current}${current.endsWith(" ") || current.endsWith("\n") ? "" : " "}${variable.token}`,
                          )
                        }
                        className="bg-muted text-muted-foreground hover:text-foreground rounded px-1.5 py-1 font-mono text-[10px] transition-colors"
                        title={variable.label}
                      >
                        {variable.token}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ctaLabel">Texto do botao</Label>
                    <Input
                      id="ctaLabel"
                      name="ctaLabel"
                      value={ctaLabel}
                      onChange={(event) => setCtaLabel(event.target.value)}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ctaUrl">Link do botao</Label>
                    <div className="relative">
                      <Link2
                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <Input
                        id="ctaUrl"
                        name="ctaUrl"
                        value={ctaUrl}
                        onChange={(event) => setCtaUrl(event.target.value)}
                        placeholder="{{CHECKOUT_URL}}"
                        className="pl-9 font-mono text-xs"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fallbackText">
                    Texto do link alternativo
                  </Label>
                  <Input
                    id="fallbackText"
                    name="fallbackText"
                    value={fallbackText}
                    onChange={(event) => setFallbackText(event.target.value)}
                    maxLength={240}
                    required
                  />
                  <p className="text-muted-foreground text-xs">
                    O endereço mostrado abaixo deste texto acompanha sempre o
                    Link do botão.
                  </p>
                </div>
              </div>

              <div className="space-y-3 xl:sticky xl:top-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Eye className="text-primary size-4" />
                    <h3 className="text-sm font-semibold">Preview do e-mail</h3>
                    <Badge variant="success">Ao vivo</Badge>
                  </div>
                  {previewRecipients.length > 0 && (
                    <label className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        Cliente
                      </span>
                      <select
                        value={selectedPreviewRecipient?.id ?? ""}
                        onChange={(event) =>
                          setPreviewRecipientId(event.target.value)
                        }
                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 max-w-56 rounded-md border px-2 text-xs outline-none focus-visible:ring-[3px]"
                      >
                        {previewRecipients.map((recipient) => (
                          <option key={recipient.id} value={recipient.id}>
                            {recipient.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="bg-muted/20 overflow-hidden rounded-md border shadow-sm">
                  <div className="bg-card border-b px-3 py-2.5">
                    <p className="truncate text-xs font-medium">
                      {renderedSubject || "Assunto do e-mail"}
                    </p>
                    <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                      Para: {previewVars.email}
                    </p>
                  </div>
                  <iframe
                    title="Preview do e-mail"
                    srcDoc={previewHtml}
                    sandbox=""
                    className="h-[620px] w-full bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              <div className="min-w-[240px] flex-1 space-y-2">
                <Label htmlFor="testEmail">E-mail para receber o teste</Label>
                <Input
                  id="testEmail"
                  name="testEmail"
                  type="email"
                  placeholder="voce@exemplo.pt"
                />
              </div>
              <Button
                type="submit"
                name="mode"
                value="test"
                variant="outline"
                loading={pending && submittingMode === "test"}
                disabled={!resendReady || !dispatchId}
                onClick={() => setSubmittingMode("test")}
              >
                <TestTube /> Enviar teste
              </Button>
              <Button
                type="submit"
                name="mode"
                value="send"
                loading={pending && submittingMode === "send"}
                disabled={!resendReady || total === 0 || !dispatchId}
                onClick={() => setSubmittingMode("send")}
              >
                <Send /> Enviar para {total}{" "}
                {total === 1 ? "cliente" : "clientes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
