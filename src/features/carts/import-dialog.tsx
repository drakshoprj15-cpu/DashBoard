"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import {
  IMPORT_COLUMNS,
  ImportFileError,
  MAX_ROWS,
  parseSheetFile,
  type RawRow,
} from "@/features/carts/import/parse";
import {
  IMPORT_STATUS_LABEL,
  validateRows,
} from "@/features/carts/import/validate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Lote enviado por requisição — o servidor recusa acima disto. */
const CHUNK_SIZE = 500;

const CURRENCIES = ["EUR", "BRL", "USD"] as const;

/**
 * Só o resultado cru do parsing fica em estado. A validação é derivada na
 * renderização porque depende também da moeda escolhida — guardá-la em
 * estado exigiria um efeito para a manter em dia, que é justamente o que
 * `react-hooks/set-state-in-effect` (e o resto do projeto) evita.
 */
interface ParsedState {
  fileName: string;
  rows: RawRow[];
  unknownHeaders: string[];
}

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após uma importação com pelo menos uma linha gravada. */
  onImported: () => void;
}

/** Modelo de planilha gerado no navegador — evita hospedar um arquivo estático. */
function downloadTemplate() {
  const example = [
    "Maria Silva",
    "maria@exemplo.com",
    "+351912345678",
    "123456789",
    "Cadeira Gaming ALPHA",
    "1",
    "39,90",
    "Abandonado",
    "https://loja.exemplo.com/checkout/abc",
    "01/08/2026",
    "01/08/2026",
    "instagram",
    "instagram",
    "black-friday",
    "social",
    "Cliente pediu para ligar à tarde",
  ];
  const csv = `﻿${IMPORT_COLUMNS.join(";")}\n${example.join(";")}`;
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-carrinhos.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Importação de carrinhos a partir de CSV/XLSX.
 *
 * O arquivo é lido no navegador e o operador vê a prévia, os avisos e os
 * erros por linha antes de qualquer gravação. Só as linhas válidas seguem
 * para o servidor, que as revalida — o cliente nunca é fonte de verdade.
 */
export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: ImportDialogProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = React.useState<ParsedState | null>(null);
  const [currency, setCurrency] =
    React.useState<(typeof CURRENCIES)[number]>("EUR");
  const [stage, setStage] = React.useState<"idle" | "parsing" | "importing">(
    "idle",
  );
  const [error, setError] = React.useState<string | null>(null);

  const preview = React.useMemo(() => {
    if (!parsed) return null;
    const { valid, invalid, warnings } = validateRows(parsed.rows, currency);
    return { ...parsed, valid, invalid, warnings };
  }, [parsed, currency]);

  function reset() {
    setParsed(null);
    setError(null);
    setStage("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setStage("parsing");
    setError(null);
    try {
      const sheet = await parseSheetFile(file);
      setParsed({
        fileName: file.name,
        rows: sheet.rows,
        unknownHeaders: sheet.unknownHeaders,
      });
    } catch (err) {
      setParsed(null);
      setError(
        err instanceof ImportFileError
          ? err.message
          : "Não foi possível ler a planilha. Confirme que é um .csv ou .xlsx válido.",
      );
    } finally {
      setStage("idle");
    }
  }

  async function handleImport() {
    if (!preview || preview.valid.length === 0) return;
    setStage("importing");

    let imported = 0;
    let duplicated = 0;
    let failed = 0;

    try {
      // Envia em lotes para não estourar o limite da rota nem o tempo da função.
      for (let i = 0; i < preview.rows.length; i += CHUNK_SIZE) {
        const chunk = preview.rows.slice(i, i + CHUNK_SIZE);
        const res = await fetch("/api/carrinhos/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk, currency }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok && res.status !== 422) {
          throw new Error(json?.message ?? "Falha na importação.");
        }
        imported += json?.imported ?? 0;
        duplicated += json?.duplicated ?? 0;
        failed += json?.failed ?? 0;
      }

      if (imported > 0) {
        toast.success(
          `${imported} ${imported === 1 ? "carrinho importado" : "carrinhos importados"}.` +
            (duplicated > 0 ? ` ${duplicated} já existiam.` : "") +
            (failed > 0 ? ` ${failed} com erro.` : ""),
        );
        onImported();
        onOpenChange(false);
        reset();
      } else {
        toast.warning(
          duplicated > 0
            ? `Nada importado — os ${duplicated} carrinhos da planilha já existem.`
            : "Nenhuma linha pôde ser importada. Verifique os erros indicados.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setStage("idle");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Importar planilha de carrinhos
          </SheetTitle>
          <SheetDescription>
            Aceita .csv e .xlsx. Nada é gravado antes de você revisar a prévia.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-4 pb-6">
          {!preview && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs font-normal">
                    Moeda dos valores
                  </Label>
                  <select
                    value={currency}
                    onChange={(e) =>
                      setCurrency(e.target.value as (typeof CURRENCIES)[number])
                    }
                    className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    aria-label="Moeda dos valores da planilha"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                >
                  <Download /> Baixar modelo
                </Button>
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="border-input hover:border-primary hover:bg-accent/40 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors"
              >
                <Upload
                  className="text-muted-foreground size-6"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">
                  {stage === "parsing"
                    ? "Lendo a planilha…"
                    : "Escolher arquivo .csv ou .xlsx"}
                </span>
                <span className="text-muted-foreground text-xs">
                  Até 5 MB e {MAX_ROWS.toLocaleString("pt-PT")} linhas por
                  importação
                </span>
              </button>

              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />

              <div className="text-muted-foreground space-y-1.5 text-xs">
                <p className="text-foreground text-sm font-medium">
                  Colunas reconhecidas
                </p>
                <p className="font-mono leading-relaxed">
                  {IMPORT_COLUMNS.join(" · ")}
                </p>
                <p>
                  Obrigatórias: <strong>produto</strong>, <strong>valor</strong>{" "}
                  e pelo menos um de <strong>nome</strong>,{" "}
                  <strong>email</strong> ou <strong>telefone</strong>. Sem
                  status, a linha entra como &ldquo;Abandonado&rdquo;.
                </p>
                <p>
                  Linhas marcadas como pagas ou convertidas entram como
                  &ldquo;Aguardando pagamento&rdquo;: venda confirmada só é
                  registada pelo gateway, nunca por planilha.
                </p>
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  {preview.valid.length} prontas para importar
                </Badge>
                {preview.invalid.length > 0 && (
                  <Badge variant="destructive">
                    {preview.invalid.length} com erro
                  </Badge>
                )}
                {preview.warnings.length > 0 && (
                  <Badge variant="warning">
                    {preview.warnings.length} avisos
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">
                  {preview.fileName}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={reset}
                  className="ml-auto"
                >
                  Trocar arquivo
                </Button>
              </div>

              {preview.unknownHeaders.length > 0 && (
                <Alert>
                  <AlertTriangle />
                  <AlertDescription>
                    Colunas ignoradas por não corresponderem a nenhum campo
                    conhecido: {preview.unknownHeaders.join(", ")}.
                  </AlertDescription>
                </Alert>
              )}

              {preview.valid.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Prévia — primeiras {Math.min(10, preview.valid.length)} de{" "}
                    {preview.valid.length} linhas
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-12">Linha</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.valid.slice(0, 10).map((row) => (
                          <TableRow key={row.line}>
                            <TableCell className="text-muted-foreground text-xs">
                              {row.line}
                            </TableCell>
                            <TableCell>
                              <p className="text-sm font-medium">
                                {row.name ?? "—"}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {row.email ?? row.phone ?? ""}
                              </p>
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.productName}
                              {row.quantity > 1 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ×{row.quantity}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {formatMoney(
                                row.amountCents * row.quantity,
                                row.currency,
                                "pt-PT",
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="muted">
                                {IMPORT_STATUS_LABEL[row.status]}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {preview.invalid.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Linhas com erro — serão ignoradas na importação
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs">
                    {preview.invalid.slice(0, 50).map((row) => (
                      <li key={row.line} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Linha {row.line}:
                        </span>
                        <span className="text-destructive">
                          {row.errors.join(" ")}
                        </span>
                      </li>
                    ))}
                    {preview.invalid.length > 50 && (
                      <li className="text-muted-foreground">
                        …e mais {preview.invalid.length - 50} linhas com erro.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Avisos</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs">
                    {preview.warnings.slice(0, 50).map((w, i) => (
                      <li key={`${w.line}-${i}`} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Linha {w.line}:
                        </span>
                        <span>{w.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.valid.length === 0 && (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertDescription>
                    Nenhuma linha válida encontrada. Corrija a planilha e envie
                    novamente.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            loading={stage === "importing"}
            disabled={!preview || preview.valid.length === 0}
            onClick={handleImport}
          >
            <CheckCircle2 />
            {preview && preview.valid.length > 0
              ? `Importar ${preview.valid.length} ${preview.valid.length === 1 ? "carrinho" : "carrinhos"}`
              : "Importar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={cn(
              stage === "importing" && "pointer-events-none opacity-60",
            )}
          >
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
