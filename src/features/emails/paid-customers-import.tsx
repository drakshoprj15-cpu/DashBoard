"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Upload,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  inferPaidImportMapping,
  paidImportStatusValues,
  parsePaidImportCsv,
  type PaidImportMapping,
  type ParsedPaidImportCsv,
} from "@/features/emails/paid-import";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STEPS = ["Arquivo", "Análise", "Mapeamento", "Importação", "Resultado"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const FIELD_LABELS: Array<{
  key: keyof PaidImportMapping;
  label: string;
  required?: boolean;
}> = [
  { key: "name", label: "Nome" },
  { key: "email", label: "E-mail", required: true },
  { key: "phone", label: "Telefone" },
  { key: "document", label: "CPF / NIF" },
  { key: "product", label: "Produto" },
  { key: "amount", label: "Valor" },
  { key: "status", label: "Status do pagamento", required: true },
  { key: "date", label: "Data" },
  { key: "origin", label: "Origem" },
];

type Analysis = {
  totalRecords: number;
  paidRecords: number;
  nonPayingRecords: number;
  validEmails: number;
  invalidEmails: number;
  duplicateRecords: number;
  uniquePaidContacts: number;
  existingContacts: number;
  newContacts: number;
  finalToImport: number;
  errors: Array<{ line: number; message: string }>;
};

type AnalyzeResponse = {
  headers: string[];
  delimiter: string;
  mapping: PaidImportMapping;
  approvedStatusValues: string[];
  statusValues: Array<{
    value: string;
    normalized: string;
    count: number;
    suggested: boolean;
  }>;
  analysis: Analysis;
};

type ImportResult = {
  importId: string;
  totalAnalyzed: number;
  paidFound: number;
  newContacts: number;
  existingContacts: number;
  updatedContacts: number;
  invalidContacts: number;
  ignoredContacts: number;
  duplicateRecords: number;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function SummaryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="border-border bg-muted/15 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "success" && "text-emerald-500",
          tone === "warning" && "text-amber-500",
        )}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Etapas da importação">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const complete = step < current;
        const active = step === current;
        return (
          <li key={label} className="min-w-0 text-center">
            <div className="flex items-center" aria-hidden="true">
              <span
                className={cn(
                  "h-px flex-1",
                  index === 0 ? "bg-transparent" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  complete && "border-emerald-500 bg-emerald-500 text-white",
                  active && "border-primary bg-primary text-primary-foreground",
                  !complete &&
                    !active &&
                    "border-border bg-background text-muted-foreground",
                )}
              >
                {complete ? <Check className="size-3.5" /> : step}
              </span>
              <span
                className={cn(
                  "h-px flex-1",
                  index === STEPS.length - 1 ? "bg-transparent" : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "mt-1 hidden truncate text-[11px] sm:block",
                active
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="bg-muted h-2 overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

export function PaidCustomersImport() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [csv, setCsv] = React.useState<ParsedPaidImportCsv | null>(null);
  const [mapping, setMapping] = React.useState<PaidImportMapping | null>(null);
  const [approvedStatuses, setApprovedStatuses] = React.useState<string[]>([]);
  const [analysis, setAnalysis] = React.useState<AnalyzeResponse | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [legalBasisConfirmed, setLegalBasisConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const statusValues = React.useMemo(
    () => (csv && mapping ? paidImportStatusValues(csv, mapping) : []),
    [csv, mapping],
  );

  function reset() {
    setStep(1);
    setFile(null);
    setCsv(null);
    setMapping(null);
    setApprovedStatuses([]);
    setAnalysis(null);
    setResult(null);
    setLegalBasisConfirmed(false);
    setBusy(false);
    setProgress(0);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function selectFile(nextFile: File | null) {
    reset();
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      toast.error("Selecione um arquivo CSV.");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      toast.error("O arquivo deve ter no máximo 10 MB.");
      return;
    }
    try {
      const parsed = parsePaidImportCsv(await nextFile.text());
      const detectedMapping = inferPaidImportMapping(parsed.headers);
      const detectedStatuses = paidImportStatusValues(parsed, detectedMapping)
        .filter((item) => item.suggested)
        .map((item) => item.value);
      setFile(nextFile);
      setCsv(parsed);
      setMapping(detectedMapping);
      setApprovedStatuses(detectedStatuses);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível ler o CSV.",
      );
    }
  }

  function requestFormData(mode: "analyze" | "import") {
    if (!file || !mapping) throw new Error("Selecione e mapeie o CSV.");
    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("file", file);
    formData.set("mapping", JSON.stringify(mapping));
    formData.set("approvedStatusValues", JSON.stringify(approvedStatuses));
    if (mode === "import") {
      formData.set("legalBasisConfirmed", String(legalBasisConfirmed));
    }
    return formData;
  }

  async function analyze(targetStep: 2 | 4) {
    if (!mapping || mapping.email === null) {
      toast.error("Confirme qual coluna contém o e-mail.");
      return;
    }
    if (!mapping || mapping.status === null) {
      toast.error("Confirme qual coluna contém o status do pagamento.");
      return;
    }
    setBusy(true);
    setProgress(30);
    try {
      const response = await fetch("/api/email-imports", {
        method: "POST",
        body: requestFormData("analyze"),
      });
      const json = (await response.json()) as AnalyzeResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(json.error || "Falha ao analisar o CSV.");
      setAnalysis(json);
      setProgress(100);
      if (targetStep === 4 && json.analysis.finalToImport === 0) {
        toast.error(
          "Nenhum pagante válido foi confirmado. Revise os status selecionados.",
        );
        return;
      }
      setStep(targetStep);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível analisar.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeMapping(field: keyof PaidImportMapping, value: string) {
    if (!mapping || !csv) return;
    const next = { ...mapping, [field]: value === "" ? null : Number(value) };
    setMapping(next);
    setAnalysis(null);
    if (field === "status") {
      setApprovedStatuses(
        paidImportStatusValues(csv, next)
          .filter((item) => item.suggested)
          .map((item) => item.value),
      );
    }
  }

  function toggleApprovedStatus(value: string) {
    setApprovedStatuses((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
    setAnalysis(null);
  }

  async function runImport() {
    if (!legalBasisConfirmed) {
      toast.error("Confirme a autorização para comunicação antes de importar.");
      return;
    }
    setBusy(true);
    setProgress(12);
    const timer = window.setInterval(
      () => setProgress((current) => Math.min(90, current + 7)),
      450,
    );
    try {
      const response = await fetch("/api/email-imports", {
        method: "POST",
        body: requestFormData("import"),
      });
      const json = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok && response.status !== 207) {
        throw new Error(json.error || "Falha ao importar os contatos.");
      }
      setResult(json);
      setProgress(100);
      setStep(5);
      router.refresh();
      toast.success("Importação concluída.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível importar.",
      );
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload /> Importar clientes pagantes
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar clientes pagantes</DialogTitle>
            <DialogDescription>
              Analise, confirme o mapeamento e importe apenas pagamentos
              aprovados. Nenhum dado é gravado antes da etapa de importação.
            </DialogDescription>
          </DialogHeader>

          <StepIndicator current={step} />

          {step === 1 && (
            <div className="space-y-4">
              <label className="border-border hover:bg-muted/30 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors">
                <FileSpreadsheet className="text-primary size-9" />
                <span className="text-sm font-semibold">
                  {file?.name ?? "Selecionar arquivo CSV"}
                </span>
                <span className="text-muted-foreground text-xs">
                  UTF-8 · até 10 MB · até 10.000 registros
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) =>
                    selectFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              {csv && file && (
                <div className="border-border bg-muted/15 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatNumber(csv.rows.length)} registros ·{" "}
                      {csv.headers.length} colunas · separador{" "}
                      {csv.delimiter === "\t"
                        ? "tabulação"
                        : `“${csv.delimiter}”`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {csv.headers.map((header, index) => (
                      <Badge key={`${header}-${index}`} variant="muted">
                        {header || `Coluna ${index + 1}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Alert variant="info">
                <ShieldCheck />
                <AlertTitle>Filtro conservador</AlertTitle>
                <AlertDescription>
                  Abandonos, pendências, recusas, cancelamentos e qualquer valor
                  ambíguo ficam fora. “Cliente” e “Lead” não são tratados como
                  pagamento aprovado automaticamente.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {step === 2 && analysis && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <SummaryMetric
                  label="Total"
                  value={analysis.analysis.totalRecords}
                />
                <SummaryMetric
                  label="Pagantes confirmados"
                  value={analysis.analysis.paidRecords}
                  tone="success"
                />
                <SummaryMetric
                  label="Não pagantes"
                  value={analysis.analysis.nonPayingRecords}
                  tone="warning"
                />
                <SummaryMetric
                  label="E-mails válidos"
                  value={analysis.analysis.validEmails}
                />
                <SummaryMetric
                  label="E-mails inválidos"
                  value={analysis.analysis.invalidEmails}
                />
                <SummaryMetric
                  label="Duplicados no CSV"
                  value={analysis.analysis.duplicateRecords}
                />
                <SummaryMetric
                  label="Já existentes"
                  value={analysis.analysis.existingContacts}
                />
                <SummaryMetric
                  label="Quantidade final"
                  value={analysis.analysis.finalToImport}
                  tone="success"
                />
              </div>
              {analysis.analysis.paidRecords === 0 && (
                <Alert variant="warning">
                  <AlertTriangle />
                  <AlertTitle>
                    Nenhum pagamento confirmado automaticamente
                  </AlertTitle>
                  <AlertDescription>
                    Revise o mapeamento e marque somente os valores que, na
                    Milu, comprovam pagamento aprovado.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 3 && csv && mapping && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold">
                  Relacionamento das colunas
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Os seletores abaixo mostram somente as colunas que existem no
                  arquivo. Campos adicionais são preservados no histórico da
                  importação.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELD_LABELS.map((field) => (
                  <label key={field.key} className="space-y-1.5 text-sm">
                    <span className="font-medium">
                      {field.label}
                      {field.required && (
                        <span className="text-destructive"> *</span>
                      )}
                    </span>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(event) =>
                        changeMapping(field.key, event.target.value)
                      }
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    >
                      <option value="">Não mapear</option>
                      {csv.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>
                          {header || `Coluna ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <fieldset className="border-border rounded-xl border p-4">
                <legend className="px-1 text-sm font-semibold">
                  Valores que confirmam pagamento
                </legend>
                <p className="text-muted-foreground mb-3 text-xs">
                  Marque apenas valores que você reconhece como pagamento
                  aprovado na fonte. Valores ambíguos permanecem ignorados.
                </p>
                {statusValues.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {statusValues.map((item) => {
                      const checked = approvedStatuses.includes(item.value);
                      return (
                        <label
                          key={item.normalized}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm",
                            checked
                              ? "border-emerald-500/35 bg-emerald-500/8"
                              : "border-border hover:bg-muted/25",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleApprovedStatus(item.value)}
                              className="accent-primary size-4"
                            />
                            <span className="truncate font-medium">
                              {item.value}
                            </span>
                            {item.suggested && (
                              <Badge variant="success">Reconhecido</Badge>
                            )}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatNumber(item.count)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <Alert variant="warning">
                    <AlertTriangle />
                    <AlertDescription>
                      Mapeie a coluna que contém o status do pagamento.
                    </AlertDescription>
                  </Alert>
                )}
              </fieldset>
            </div>
          )}

          {step === 4 && analysis && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <SummaryMetric
                  label="Pagantes"
                  value={analysis.analysis.paidRecords}
                />
                <SummaryMetric
                  label="Novos estimados"
                  value={analysis.analysis.newContacts}
                />
                <SummaryMetric
                  label="Já existentes"
                  value={analysis.analysis.existingContacts}
                />
              </div>
              <label className="border-border bg-muted/15 flex cursor-pointer gap-3 rounded-xl border p-4">
                <input
                  type="checkbox"
                  checked={legalBasisConfirmed}
                  onChange={(event) =>
                    setLegalBasisConfirmed(event.target.checked)
                  }
                  className="accent-primary mt-0.5 size-4 shrink-0"
                />
                <span>
                  <span className="block text-sm font-semibold">
                    Confirmo a autorização para comunicação
                  </span>
                  <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                    Tenho consentimento ou outra base legal válida para usar
                    estes contatos. Descadastros, bloqueios e supressões
                    existentes serão preservados.
                  </span>
                </span>
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {busy
                      ? "Processando lotes com segurança…"
                      : "Pronto para importar"}
                  </span>
                  <span className="font-medium tabular-nums">{progress}%</span>
                </div>
                <ProgressBar value={progress} />
              </div>
            </div>
          )}

          {step === 5 && result && (
            <div className="space-y-5">
              <div className="flex flex-col items-center py-2 text-center">
                <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-500">
                  <CheckCircle2 className="size-6" />
                </span>
                <h3 className="text-lg font-semibold">Importação concluída</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Os contatos elegíveis já estão disponíveis nos segmentos de
                  e-mail.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryMetric
                  label="Total analisado"
                  value={result.totalAnalyzed}
                />
                <SummaryMetric
                  label="Pagantes encontrados"
                  value={result.paidFound}
                />
                <SummaryMetric
                  label="Novos clientes"
                  value={result.newContacts}
                  tone="success"
                />
                <SummaryMetric
                  label="Já existentes"
                  value={result.existingContacts}
                />
                <SummaryMetric
                  label="Atualizados"
                  value={result.updatedContacts}
                />
                <SummaryMetric
                  label="Inválidos"
                  value={result.invalidContacts}
                  tone="warning"
                />
                <SummaryMetric
                  label="Ignorados"
                  value={result.ignoredContacts}
                />
                <SummaryMetric
                  label="Duplicados no CSV"
                  value={result.duplicateRecords}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {step > 1 && step < 5 ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setStep((current) => Math.max(1, current - 1))}
              >
                <ArrowLeft /> Voltar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {step === 5 ? "Fechar" : "Cancelar"}
              </Button>
            )}

            {step === 1 && (
              <Button
                type="button"
                disabled={!file || !mapping || busy}
                onClick={() => analyze(2)}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <UsersRound />
                )}
                {busy ? "Analisando…" : "Analisar arquivo"}
              </Button>
            )}
            {step === 2 && (
              <Button type="button" onClick={() => setStep(3)}>
                Revisar mapeamento <ArrowRight />
              </Button>
            )}
            {step === 3 && (
              <Button type="button" disabled={busy} onClick={() => analyze(4)}>
                {busy && <LoaderCircle className="animate-spin" />}
                Reanalisar e continuar <ArrowRight />
              </Button>
            )}
            {step === 4 && (
              <Button
                type="button"
                disabled={busy || !legalBasisConfirmed}
                onClick={runImport}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
                {busy ? "Importando…" : "Importar clientes pagantes"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
