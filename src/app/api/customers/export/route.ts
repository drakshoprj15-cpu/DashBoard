import { recordAuditLog } from "@/features/audit/log";
import {
  CustomerAccessError,
  requireCustomerPermission,
} from "@/features/customers/access";
import {
  parseCustomerFilters,
  sanitizeCsvCell,
} from "@/features/customers/customer-utils";
import { listCustomersForExport } from "@/features/customers/queries";
import { consumeCustomerRateLimit } from "@/features/customers/rate-limit";

interface ExportBody {
  filters?: string;
  customerIds?: string[];
  scope?: string;
}

export async function POST(request: Request) {
  try {
    const access = await requireCustomerPermission("export");
    const rate = consumeCustomerRateLimit(
      `customers:export:${access.userId}`,
      10,
      60_000,
    );
    if (!rate.allowed)
      return Response.json(
        { error: "Muitas exportações. Tente novamente em instantes." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    const body = (await request.json()) as ExportBody;
    const params = new URLSearchParams(body.filters ?? "");
    if (body.scope === "buyers") params.set("type", "buyer");
    if (body.scope === "leads") params.set("type", "lead");
    if (body.scope === "abandoned") params.set("type", "abandoned");
    if (body.scope === "pending") params.set("type", "pending");
    if (body.scope === "refused") params.set("type", "refused");
    if (body.scope === "recurring") params.set("type", "recurring");
    const filters = parseCustomerFilters(params);
    const rows = await listCustomersForExport(filters, body.customerIds);

    const header = [
      "Nome",
      "Email",
      "Telefone",
      "Cidade",
      "Estado",
      "País",
      "Origem",
      "Tipos",
      "Pedidos",
      "Pedidos pagos",
      "Total gasto (centavos)",
      "Moeda",
      "Última atividade",
      "Aceita comunicações",
      "Criado em",
    ];
    const csv = [
      header.map(sanitizeCsvCell).join(","),
      ...rows.map((row) =>
        [
          row.name,
          row.email,
          row.phone,
          row.city,
          row.state,
          row.country,
          row.source,
          row.statuses.map((status) => status.label).join(" | "),
          row.orderCount,
          row.paidCount,
          row.totalSpentCents,
          row.currency,
          row.lastActivityAt,
          row.acceptsCommunication ? "Sim" : "Não",
          row.createdAt,
        ]
          .map(sanitizeCsvCell)
          .join(","),
      ),
    ].join("\r\n");

    await recordAuditLog({
      action: "customer.exported",
      entityType: "customer",
      changes: { count: rows.length, scope: body.scope ?? "filtered" },
      workspaceId: access.workspaceId,
      actorId: access.userId,
    });

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clientes-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof CustomerAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[customers:export] falha na exportação", error);
    return Response.json(
      { error: "Não foi possível exportar." },
      { status: 500 },
    );
  }
}
