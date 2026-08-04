import { CustomerAccessError } from "@/features/customers/access";
import {
  anonymizeCustomersAction,
  updateCustomerAction,
} from "@/features/customers/actions";
import { getCustomerDetail } from "@/features/customers/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const customer = await getCustomerDetail(id);
    if (!customer) {
      return Response.json(
        { error: "Cliente não encontrado." },
        { status: 404 },
      );
    }
    return Response.json(customer);
  } catch (error) {
    if (error instanceof CustomerAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[customers:detail] falha ao carregar perfil", error);
    return Response.json(
      { error: "Não foi possível carregar o perfil." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await updateCustomerAction(id, await request.json());
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof CustomerAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Não foi possível atualizar o cliente." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await anonymizeCustomersAction([id]);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof CustomerAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Não foi possível anonimizar o cliente." },
      { status: 500 },
    );
  }
}
