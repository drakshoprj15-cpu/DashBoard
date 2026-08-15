import readXlsxFile from "read-excel-file/node";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/database/client";
import {
  customerActivities,
  customerAddresses,
  customers,
  products,
} from "@/database/schema";
import { recordAuditLog } from "@/features/audit/log";
import {
  CustomerAccessError,
  requireCustomerPermission,
} from "@/features/customers/access";
import {
  isCustomerImportClassification,
  mergeCustomerImportTags,
  normalizeDocument,
  normalizeEmail,
  normalizeImportedProductName,
  normalizePhone,
  resolveDuplicateCandidate,
} from "@/features/customers/customer-utils";
import { consumeCustomerRateLimit } from "@/features/customers/rate-limit";

export const runtime = "nodejs";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 5_000;

type Cell = string | number | boolean | Date | null;

function parseCsv(text: string): Cell[][] {
  const delimiter =
    (text.split("\n")[0]?.match(/;/g)?.length ?? 0) >
    (text.split("\n")[0]?.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizedHeader(value: Cell): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["nome", "first_name", "firstname", "primeiro_nome"],
  lastName: ["sobrenome", "last_name", "lastname", "apelido"],
  email: ["email", "e_mail"],
  phone: ["telefone", "telemovel", "phone", "celular", "whatsapp"],
  document: ["cpf", "nif", "documento", "document"],
  country: ["pais", "country"],
  state: ["estado", "uf", "state"],
  city: ["cidade", "city"],
  postalCode: ["cep", "codigo_postal", "postal_code", "postcode"],
  tags: ["tags", "etiquetas"],
  consent: ["consentimento", "aceita_comunicacoes", "opt_in"],
  product: [
    "produto",
    "produto_comprado",
    "nome_do_produto",
    "product",
    "product_name",
  ],
};

function findColumn(headers: string[], key: string): number {
  return headers.findIndex((header) => HEADER_ALIASES[key]?.includes(header));
}

function cellValue(row: Cell[], index: number): string {
  if (index < 0) return "";
  return String(row[index] ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const access = await requireCustomerPermission("import");
    const rate = consumeCustomerRateLimit(
      `customers:import:${access.userId}`,
      5,
      60_000,
    );
    if (!rate.allowed)
      return Response.json(
        { error: "Muitas importações. Tente novamente em instantes." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    const formData = await request.formData();
    const file = formData.get("file");
    const requestedClassification = formData.get("classification") ?? "contact";
    const requestedProductId = String(
      formData.get("defaultProductId") ?? "",
    ).trim();
    const requestedProductName = String(
      formData.get("defaultProductName") ?? "",
    ).trim();
    if (!isCustomerImportClassification(requestedClassification)) {
      return Response.json(
        { error: "Selecione uma classificação válida para esta lista." },
        { status: 400 },
      );
    }
    const classification = requestedClassification;
    if (!(file instanceof File)) {
      return Response.json(
        { error: "Selecione um arquivo CSV ou XLSX." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "O arquivo deve ter no máximo 5 MB." },
        { status: 413 },
      );
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension || !["csv", "xlsx"].includes(extension)) {
      return Response.json(
        { error: "Formato não permitido. Use CSV ou XLSX." },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawRows: Cell[][] =
      extension === "xlsx"
        ? ((await readXlsxFile(buffer)) as unknown as Cell[][])
        : parseCsv(buffer.toString("utf8").replace(/^\uFEFF/, ""));
    if (rawRows.length < 2) {
      return Response.json(
        { error: "O arquivo não possui linhas para importar." },
        { status: 400 },
      );
    }
    if (rawRows.length - 1 > MAX_ROWS) {
      return Response.json(
        { error: `O limite é de ${MAX_ROWS} linhas por importação.` },
        { status: 413 },
      );
    }

    const headers = rawRows[0].map(normalizedHeader);
    const columns = Object.fromEntries(
      Object.keys(HEADER_ALIASES).map((key) => [key, findColumn(headers, key)]),
    ) as Record<string, number>;
    if (columns.email < 0) {
      return Response.json(
        {
          error:
            "Não encontramos a coluna de e-mail. Renomeie o cabeçalho para ‘Email’.",
        },
        { status: 400 },
      );
    }

    const db = getDb();
    const catalogProducts = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, access.workspaceId),
          isNull(products.deletedAt),
        ),
      );
    const productsById = new Map(
      catalogProducts.map((product) => [product.id, product]),
    );
    const productsByName = new Map(
      catalogProducts.map((product) => [
        product.name.trim().toLocaleLowerCase("pt"),
        product,
      ]),
    );
    const selectedProduct = requestedProductId
      ? productsById.get(requestedProductId)
      : null;
    if (requestedProductId && !selectedProduct) {
      return Response.json(
        { error: "O produto selecionado não pertence a este workspace." },
        { status: 400 },
      );
    }
    const customDefaultProductName = requestedProductName
      ? normalizeImportedProductName(requestedProductName)
      : null;
    if (requestedProductName && !customDefaultProductName) {
      return Response.json(
        { error: "Informe um nome de produto válido, com até 160 caracteres." },
        { status: 400 },
      );
    }
    const defaultProductName =
      selectedProduct?.name ?? customDefaultProductName;
    const defaultProductId = selectedProduct?.id ?? null;
    const result = {
      total: rawRows.length - 1,
      imported: 0,
      updated: 0,
      invalid: 0,
      duplicated: 0,
      errors: [] as Array<{ line: number; message: string }>,
    };

    for (const [index, row] of rawRows.slice(1).entries()) {
      const line = index + 2;
      const email = normalizeEmail(cellValue(row, columns.email));
      const phoneOriginal = cellValue(row, columns.phone);
      const phone = phoneOriginal ? normalizePhone(phoneOriginal) : null;
      const documentOriginal = cellValue(row, columns.document);
      const document = documentOriginal
        ? normalizeDocument(documentOriginal)
        : null;
      const rawProductName = cellValue(row, columns.product);
      const rowProductName = rawProductName
        ? normalizeImportedProductName(rawProductName)
        : null;
      if (rawProductName && !rowProductName) {
        result.invalid += 1;
        result.errors.push({
          line,
          message: "Produto inválido. Use um nome com até 160 caracteres.",
        });
        continue;
      }
      const importedProductName = defaultProductName ?? rowProductName;
      if (classification !== "contact" && !importedProductName) {
        result.invalid += 1;
        result.errors.push({
          line,
          message:
            "Produto é obrigatório para compras pagas e pedidos pendentes. Adicione a coluna Produto ou escolha um produto padrão.",
        });
        continue;
      }
      const matchedProduct = importedProductName
        ? productsByName.get(importedProductName.toLocaleLowerCase("pt"))
        : null;
      const importedProductId = defaultProductId ?? matchedProduct?.id ?? null;
      if (
        !email ||
        (phoneOriginal && !phone) ||
        (documentOriginal && !document)
      ) {
        result.invalid += 1;
        result.errors.push({
          line,
          message: "E-mail, telefone ou documento inválido.",
        });
        continue;
      }

      try {
        const identityConditions = [
          eq(customers.normalizedEmail, email),
          sql`lower(trim(${customers.email})) = ${email}`,
        ];
        if (phone)
          identityConditions.push(eq(customers.normalizedPhone, phone));
        if (document) identityConditions.push(eq(customers.document, document));
        const candidates = await db
          .select({
            id: customers.id,
            email: customers.email,
            normalizedEmail: customers.normalizedEmail,
            normalizedPhone: customers.normalizedPhone,
            normalizedDocument: customers.document,
            tags: customers.tags,
          })
          .from(customers)
          .where(
            and(
              eq(customers.workspaceId, access.workspaceId),
              or(...identityConditions),
            ),
          )
          .limit(20);
        const existing = resolveDuplicateCandidate(candidates, {
          normalizedEmail: email,
          normalizedPhone: phone,
          normalizedDocument: document,
        });
        const firstName = cellValue(row, columns.firstName);
        const lastName = cellValue(row, columns.lastName);
        const country = cellValue(row, columns.country);
        const state = cellValue(row, columns.state);
        const city = cellValue(row, columns.city);
        const postalCode = cellValue(row, columns.postalCode);
        const tags = cellValue(row, columns.tags)
          .split(/[|,;]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 20);
        const consent = /^(sim|yes|true|1)$/i.test(
          cellValue(row, columns.consent),
        );
        const classifiedTags = mergeCustomerImportTags(
          existing?.tags,
          tags,
          classification,
        );
        const now = new Date();

        if (existing) {
          await db
            .update(customers)
            .set({
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              phone: phoneOriginal || undefined,
              normalizedPhone: phone || undefined,
              document: document || undefined,
              country: country || undefined,
              importedProductId: importedProductName
                ? importedProductId
                : undefined,
              importedProductName: importedProductName || undefined,
              tags: classifiedTags,
              normalizedEmail: email,
              acceptsEmail: consent,
              marketingOptOut: !consent,
              lastActivityAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(customers.id, existing.id),
                eq(customers.workspaceId, access.workspaceId),
              ),
            );
          result.updated += 1;
          result.duplicated += 1;
          continue;
        }

        const customerId = crypto.randomUUID();
        await db.transaction(async (tx) => {
          await tx.insert(customers).values({
            id: customerId,
            workspaceId: access.workspaceId,
            firstName: firstName || null,
            lastName: lastName || null,
            email,
            normalizedEmail: email,
            emailStatus: "valid",
            phone: phoneOriginal || null,
            normalizedPhone: phone,
            document,
            country: country || null,
            importedProductId,
            importedProductName,
            tags: classifiedTags,
            source: "import",
            firstSource: "import",
            acceptsEmail: consent,
            marketingOptOut: !consent,
            firstSeenAt: now,
            lastActivityAt: now,
          });
          if (country || state || city || postalCode) {
            await tx.insert(customerAddresses).values({
              workspaceId: access.workspaceId,
              customerId,
              country: country || "Não informado",
              state: state || null,
              city: city || null,
              postalCode: postalCode || null,
              isDefault: true,
            });
          }
          await tx.insert(customerActivities).values({
            workspaceId: access.workspaceId,
            customerId,
            type: "customer_imported",
            source: "import",
            createdBy: access.userId,
            metadata: {
              line,
              classification,
              importedProductName,
            },
          });
        });
        result.imported += 1;
      } catch {
        result.invalid += 1;
        result.errors.push({
          line,
          message: "Não foi possível gravar esta linha.",
        });
      }
    }

    await recordAuditLog({
      action: "customer.imported",
      entityType: "customer",
      changes: {
        total: result.total,
        imported: result.imported,
        updated: result.updated,
        invalid: result.invalid,
        classification,
        hasDefaultProduct: Boolean(defaultProductName),
      },
      workspaceId: access.workspaceId,
      actorId: access.userId,
    });

    return Response.json(result, { status: result.invalid > 0 ? 207 : 200 });
  } catch (error) {
    if (error instanceof CustomerAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[customers:import] falha na importação", error);
    return Response.json(
      { error: "Não foi possível importar o arquivo." },
      { status: 500 },
    );
  }
}
