import { z } from "zod";

import { CustomerAccessError } from "@/features/customers/access";
import { addCustomerNoteAction } from "@/features/customers/actions";

const bodySchema = z.object({ content: z.string().trim().min(1).max(4_000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: "Observação inválida." }, { status: 400 });
    const result = await addCustomerNoteAction(
      (await params).id,
      parsed.data.content,
    );
    return Response.json(result, { status: result.ok ? 201 : 400 });
  } catch (error) {
    if (error instanceof CustomerAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Não foi possível adicionar a observação." },
      { status: 500 },
    );
  }
}
