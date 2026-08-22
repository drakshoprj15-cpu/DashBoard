import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  CustomerAccessError,
  requireCustomerPermission,
} from "@/features/customers/access";
import {
  MilluniSyncError,
  syncMilluniCustomers,
} from "@/features/integrations/milluni/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

function errorResponse(error: unknown) {
  if (error instanceof MilluniSyncError) {
    const status =
      error.code === "configuration_missing" ||
      error.code === "password_change_required"
        ? 503
        : 502;
    return Response.json({ ok: false, error: error.code }, { status });
  }
  if (error instanceof CustomerAccessError) {
    return Response.json(
      { ok: false, error: error.message },
      { status: error.status },
    );
  }
  console.error("[milluni-sync] falha inesperada", error);
  return Response.json({ ok: false, error: "sync_failed" }, { status: 500 });
}

/** Execução agendada por um servidor externo, autenticada por CRON_SECRET. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const workspaceId = await getOrCreateDefaultWorkspace();
    const result = await syncMilluniCustomers(workspaceId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Execução manual por um utilizador do painel com permissão de importação. */
export async function POST() {
  try {
    const { workspaceId } = await requireCustomerPermission("import");
    const result = await syncMilluniCustomers(workspaceId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
