import { z } from "zod";

import { CustomerAccessError } from "@/features/customers/access";
import {
  anonymizeCustomersAction,
  applyCustomerTagAction,
  removeCustomerTagAction,
} from "@/features/customers/actions";

const bodySchema = z.object({
  action: z.enum(["add_tag", "remove_tag", "anonymize"]),
  customerIds: z.array(z.string().uuid()).min(1).max(500),
  tag: z.string().max(60).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "Ação em massa inválida." },
        { status: 400 },
      );
    }
    const result =
      parsed.data.action === "add_tag"
        ? await applyCustomerTagAction(
            parsed.data.customerIds,
            parsed.data.tag ?? "",
          )
        : parsed.data.action === "remove_tag"
          ? await removeCustomerTagAction(
              parsed.data.customerIds,
              parsed.data.tag ?? "",
            )
          : await anonymizeCustomersAction(parsed.data.customerIds);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof CustomerAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[customers:bulk] falha na ação", error);
    return Response.json(
      { error: "Não foi possível concluir a ação." },
      { status: 500 },
    );
  }
}
