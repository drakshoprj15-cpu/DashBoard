"use client";

import * as React from "react";
import {
  CircleCheckBig,
  Clock3,
  Download,
  FileSpreadsheet,
  Info,
  Upload,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  createCustomerAction,
  createCustomerSegmentAction,
} from "@/features/customers/actions";
import type { CustomerImportClassification } from "@/features/customers/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ControlledDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AddCustomerDialogProps extends ControlledDialogProps {
  onCreated: (customerId: string) => void;
  onDuplicate: (customerId: string) => void;
}

export function AddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
  onDuplicate,
}: AddCustomerDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const [acceptsEmail, setAcceptsEmail] = React.useState(false);
  const [acceptsWhatsapp, setAcceptsWhatsapp] = React.useState(false);
  const [duplicate, setDuplicate] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  function submit(forceCreate = false) {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set("acceptsEmail", String(acceptsEmail));
    formData.set("acceptsWhatsapp", String(acceptsWhatsapp));
    formData.set("forceCreate", String(forceCreate));
    startTransition(async () => {
      const result = await createCustomerAction(formData);
      if (result.duplicateId) {
        setDuplicate(result.duplicateId);
        toast.warning(result.error);
        return;
      }
      if (!result.ok || !result.customerId) {
        toast.error(result.error ?? "Não foi possível adicionar o cliente.");
        return;
      }
      toast.success(result.message);
      setDuplicate(null);
      formRef.current?.reset();
      setAcceptsEmail(false);
      setAcceptsWhatsapp(false);
      onOpenChange(false);
      onCreated(result.customerId);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar cliente</DialogTitle>
          <DialogDescription>
            Cadastre um contato manualmente. O sistema verifica duplicidade por
            e-mail, telefone e documento.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          className="grid gap-4 overflow-y-auto pr-1 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Nome</Label>
            <Input id="firstName" name="firstName" required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Sobrenome</Label>
            <Input id="lastName" name="lastName" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              placeholder="+55 21 99999-9999"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="document">CPF/NIF</Label>
            <Input id="document" name="document" maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">País</Label>
            <Input id="country" name="country" maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">Estado</Label>
            <Input id="state" name="state" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">Cidade</Label>
            <Input id="city" name="city" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postalCode">CEP</Label>
            <Input id="postalCode" name="postalCode" maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="street">Endereço</Label>
            <Input id="street" name="street" maxLength={180} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="number">Número</Label>
            <Input id="number" name="number" maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="complement">Complemento</Label>
            <Input id="complement" name="complement" maxLength={120} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="note">Observação</Label>
            <textarea
              id="note"
              name="note"
              rows={3}
              maxLength={4000}
              className="border-input bg-background w-full rounded-md border p-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={acceptsEmail}
              onChange={(event) => setAcceptsEmail(event.target.checked)}
              className="accent-primary mt-0.5 size-4"
            />
            Aceita receber comunicações por e-mail
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={acceptsWhatsapp}
              onChange={(event) => setAcceptsWhatsapp(event.target.checked)}
              className="accent-primary mt-0.5 size-4"
            />
            Aceita contato por WhatsApp
          </label>
        </form>
        {duplicate && (
          <div className="border-warning/40 bg-warning/10 rounded-lg border p-3 text-sm">
            <p className="font-medium">
              Encontramos um cliente com dados semelhantes.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onDuplicate(duplicate)}
              >
                Abrir cliente existente
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => submit(true)}
              >
                Criar mesmo assim
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => submit(false)}
          >
            {pending ? "Salvando..." : "Adicionar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ImportCustomersDialogProps extends ControlledDialogProps {
  onImported: () => void;
}

const IMPORT_CLASSIFICATION_OPTIONS = [
  {
    value: "paid",
    label: "Compras pagas",
    description: "A planilha informa que estes clientes já pagaram.",
    icon: CircleCheckBig,
    tone: "success",
  },
  {
    value: "pending",
    label: "Pedidos pendentes",
    description: "O pagamento ainda precisa ser confirmado.",
    icon: Clock3,
    tone: "warning",
  },
  {
    value: "contact",
    label: "Apenas contatos",
    description: "Importa a base sem atribuir situação de compra.",
    icon: UsersRound,
    tone: "neutral",
  },
] as const satisfies ReadonlyArray<{
  value: CustomerImportClassification;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "warning" | "neutral";
}>;

export function ImportCustomersDialog({
  open,
  onOpenChange,
  onImported,
}: ImportCustomersDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [classification, setClassification] =
    React.useState<CustomerImportClassification>("contact");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<Record<string, unknown> | null>(
    null,
  );

  function downloadErrors() {
    const errors = Array.isArray(result?.errors)
      ? (result.errors as Array<{ line?: unknown; message?: unknown }>)
      : [];
    if (errors.length === 0) return;
    const csv = [
      '"Linha","Erro"',
      ...errors.map(
        (error) =>
          `"${String(error.line ?? "")}","${String(error.message ?? "").replace(/"/g, '""')}"`,
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "erros-importacao-clientes.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    if (!file) return;
    setPending(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("classification", classification);
    try {
      const response = await fetch("/api/customers/import", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (!response.ok && response.status !== 207)
        throw new Error(String(json.error ?? "Falha"));
      setResult(json);
      toast.success("Importação concluída.");
      onImported();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível importar.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
          <DialogDescription>
            Envie CSV ou XLSX de até 5 MB. Reconhecemos automaticamente nome,
            e-mail, telefone, CPF/NIF, localização, tags e consentimento.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">
            Como esta lista deve ser organizada?
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {IMPORT_CLASSIFICATION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = classification === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "group relative cursor-pointer rounded-xl border p-3 transition-colors",
                    "hover:border-primary/35 hover:bg-muted/30",
                    selected &&
                      "border-primary bg-primary/6 ring-primary/15 ring-2",
                  )}
                >
                  <input
                    type="radio"
                    name="classification"
                    value={option.value}
                    checked={selected}
                    onChange={() => {
                      setClassification(option.value);
                      setResult(null);
                    }}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "mb-3 flex size-8 items-center justify-center rounded-lg border",
                      option.tone === "success" &&
                        "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
                      option.tone === "warning" &&
                        "border-amber-500/20 bg-amber-500/10 text-amber-500",
                      option.tone === "neutral" &&
                        "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                    {option.description}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-3 right-3 size-2 rounded-full border",
                      selected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40",
                    )}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="border-info/20 bg-info/8 text-muted-foreground flex gap-2 rounded-lg border p-3 text-xs leading-relaxed">
          <Info className="text-info mt-0.5 size-4 shrink-0" />
          <p>
            A classificação organiza a sua lista, mas não cria pedidos, receita
            ou pagamentos. A confirmação financeira continua vindo do pedido e
            do gateway.
          </p>
        </div>
        <label className="border-border hover:bg-muted/30 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <Upload className="text-primary size-8" />
          <span className="text-sm font-medium">
            {file?.name ?? "Selecionar arquivo"}
          </span>
          <span className="text-muted-foreground text-xs">
            CSV ou XLSX · máximo 5 MB
          </span>
          <input
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>
        {result && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-center text-xs sm:grid-cols-5">
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="text-lg font-semibold">
                {String(result.total ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Importados</p>
              <p className="text-lg font-semibold">
                {String(result.imported ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Atualizados</p>
              <p className="text-lg font-semibold">
                {String(result.updated ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Inválidos</p>
              <p className="text-lg font-semibold">
                {String(result.invalid ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Duplicados</p>
              <p className="text-lg font-semibold">
                {String(result.duplicated ?? 0)}
              </p>
            </div>
          </div>
        )}
        {Array.isArray(result?.errors) && result.errors.length > 0 && (
          <Button type="button" variant="outline" onClick={downloadErrors}>
            <Download /> Baixar arquivo de erros
          </Button>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
          <Button type="button" disabled={!file || pending} onClick={submit}>
            <FileSpreadsheet />{" "}
            {pending ? "Importando..." : "Validar e importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExportCustomersDialogProps extends ControlledDialogProps {
  selectedCount: number;
  onExport: (scope: string) => Promise<void>;
}

export function ExportCustomersDialog({
  open,
  onOpenChange,
  selectedCount,
  onExport,
}: ExportCustomersDialogProps) {
  const [scope, setScope] = React.useState("filtered");
  const [pending, setPending] = React.useState(false);
  async function submit() {
    setPending(true);
    try {
      await onExport(scope);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar clientes</DialogTitle>
          <DialogDescription>
            O CSV é protegido contra fórmulas maliciosas e inclui somente
            clientes do workspace atual.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="export-scope">Registros</Label>
          <select
            id="export-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="filtered">Clientes filtrados</option>
            <option value="all">Todos os clientes</option>
            <option value="selected" disabled={selectedCount === 0}>
              Selecionados ({selectedCount})
            </option>
            <option value="buyers">Compradores</option>
            <option value="leads">Leads</option>
            <option value="abandoned">Carrinhos abandonados</option>
            <option value="pending">Pedidos pendentes</option>
            <option value="refused">Pagamentos recusados</option>
            <option value="recurring">Clientes recorrentes</option>
          </select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Preparando..." : "Exportar CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SegmentDialogProps extends ControlledDialogProps {
  currentFilters: string;
  estimatedCount: number;
}

export function SegmentDialog({
  open,
  onOpenChange,
  currentFilters,
  estimatedCount,
}: SegmentDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);
  function submit() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set("rules", JSON.stringify({ query: currentFilters }));
    formData.set("estimatedCount", String(estimatedCount));
    startTransition(async () => {
      const result = await createCustomerSegmentAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      formRef.current?.reset();
      onOpenChange(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar segmento</DialogTitle>
          <DialogDescription>
            Salve os filtros atuais como um público reutilizável. Estimativa:{" "}
            {estimatedCount} contato(s).
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="segment-name">Nome</Label>
            <Input id="segment-name" name="name" required maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="segment-description">Descrição</Label>
            <Input
              id="segment-description"
              name="description"
              maxLength={240}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="segment-type">Tipo</Label>
            <select
              id="segment-type"
              name="type"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="dynamic">
                Dinâmico — atualiza automaticamente
              </option>
              <option value="static">Estático</option>
            </select>
          </div>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Salvando..." : "Criar segmento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
