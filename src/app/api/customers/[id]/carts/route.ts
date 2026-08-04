import { CustomerAccessError } from "@/features/customers/access";
import { getCustomerDetail } from "@/features/customers/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const detail = await getCustomerDetail((await params).id);
    if (!detail)
      return Response.json(
        { error: "Cliente não encontrado." },
        { status: 404 },
      );
    return Response.json(detail.carts);
  } catch (error) {
    if (error instanceof CustomerAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Não foi possível listar os carrinhos." },
      { status: 500 },
    );
  }
}
