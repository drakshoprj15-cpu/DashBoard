import { NextRequest } from "next/server";

import { CustomerAccessError } from "@/features/customers/access";
import { createCustomerAction } from "@/features/customers/actions";
import { parseCustomerFilters } from "@/features/customers/customer-utils";
import { listCustomers } from "@/features/customers/queries";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof CustomerAccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[customers] operação falhou", error);
  return Response.json(
    { error: "Não foi possível carregar os clientes." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const filters = parseCustomerFilters(request.nextUrl.searchParams);
    return Response.json(await listCustomers(filters));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value != null) formData.set(key, String(value));
    }
    const result = await createCustomerAction(formData);
    return Response.json(result, {
      status: result.ok ? 201 : result.duplicateId ? 409 : 400,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
