import { revalidatePath } from "next/cache";

import {
  CustomerAccessError,
  requireCustomerPermission,
} from "@/features/customers/access";
import { consumeCustomerRateLimit } from "@/features/customers/rate-limit";
import {
  analyzePaidImportCsv,
  inferPaidImportMapping,
  paidImportStatusValues,
  parsePaidImportCsv,
  sanitizePaidImportMapping,
} from "@/features/emails/paid-import";
import {
  analyzePaidImportForWorkspace,
  importPaidContacts,
} from "@/features/emails/paid-import-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;

class PaidImportRequestError extends Error {}

function jsonValue(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function approvedStatuses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 120))
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

function errorResponse(error: unknown) {
  if (error instanceof CustomerAccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof PaidImportRequestError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json(
    { error: "Não foi possível processar o arquivo." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const access = await requireCustomerPermission("import");
    const formData = await request.formData();
    const mode = formData.get("mode") === "import" ? "import" : "analyze";
    const rate = consumeCustomerRateLimit(
      `email-imports:${mode}:${access.userId}`,
      mode === "import" ? 3 : 12,
      60_000,
    );
    if (!rate.allowed) {
      return Response.json(
        { error: "Muitas solicitações. Tente novamente em instantes." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new PaidImportRequestError("Selecione um arquivo CSV.");
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return Response.json(
        { error: "Formato não permitido. Use um arquivo CSV." },
        { status: 415 },
      );
    }
    if (file.size === 0)
      throw new PaidImportRequestError("O arquivo CSV está vazio.");
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "O arquivo deve ter no máximo 10 MB." },
        { status: 413 },
      );
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      throw new PaidImportRequestError(
        "O CSV precisa estar codificado em UTF-8.",
      );
    }
    let csv;
    try {
      csv = parsePaidImportCsv(text, MAX_ROWS);
    } catch (error) {
      throw new PaidImportRequestError(
        error instanceof Error ? error.message : "O CSV é inválido.",
      );
    }
    const requestedMapping = jsonValue(formData.get("mapping"));
    const mapping = requestedMapping
      ? sanitizePaidImportMapping(requestedMapping, csv.headers.length)
      : inferPaidImportMapping(csv.headers);
    const selectedStatuses = approvedStatuses(
      jsonValue(formData.get("approvedStatusValues")),
    );
    const local = analyzePaidImportCsv(csv, mapping, selectedStatuses);

    if (mode === "analyze") {
      const analysis = await analyzePaidImportForWorkspace(
        access.workspaceId,
        local,
      );
      return Response.json({
        headers: csv.headers,
        delimiter: csv.delimiter,
        mapping,
        approvedStatusValues: selectedStatuses,
        statusValues: paidImportStatusValues(csv, mapping),
        analysis,
      });
    }

    if (mapping.email === null) {
      throw new PaidImportRequestError("Confirme qual coluna contém o e-mail.");
    }
    if (mapping.status === null) {
      throw new PaidImportRequestError(
        "Confirme qual coluna contém o status do pagamento.",
      );
    }
    if (selectedStatuses.length === 0) {
      throw new PaidImportRequestError(
        "Selecione ao menos um status que confirme pagamento aprovado.",
      );
    }
    if (formData.get("legalBasisConfirmed") !== "true") {
      throw new PaidImportRequestError(
        "Confirme que estes contatos podem receber as suas comunicações.",
      );
    }
    if (local.contacts.length === 0) {
      throw new PaidImportRequestError(
        "Nenhum cliente pagante válido foi encontrado.",
      );
    }

    const result = await importPaidContacts({
      access,
      local,
      fileName: file.name,
    });
    revalidatePath("/emails");
    revalidatePath("/clientes");
    return Response.json(result, {
      status: result.invalidContacts > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("[email-imports] falha", error);
    return errorResponse(error);
  }
}
