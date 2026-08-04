import { CustomerAccessError } from "@/features/customers/access";
import { parseCustomerFilters } from "@/features/customers/customer-utils";
import { listCustomers } from "@/features/customers/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const filters = parseCustomerFilters(new URL(request.url).searchParams);
    const result = await listCustomers({ ...filters, page: 1, pageSize: 20 });
    return Response.json(result.stats);
  } catch (error) {
    if (error instanceof CustomerAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Não foi possível carregar os indicadores." },
      { status: 500 },
    );
  }
}
