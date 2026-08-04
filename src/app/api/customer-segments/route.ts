import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/database/client";
import { customerSegments } from "@/database/schema";
import {
  CustomerAccessError,
  requireCustomerPermission,
} from "@/features/customers/access";
import { createCustomerSegmentAction } from "@/features/customers/actions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireCustomerPermission("view");
    const rows = await getDb()
      .select({
        id: customerSegments.id,
        name: customerSegments.name,
        description: customerSegments.description,
        type: customerSegments.type,
        rules: customerSegments.rules,
        createdAt: customerSegments.createdAt,
      })
      .from(customerSegments)
      .where(
        and(
          eq(customerSegments.workspaceId, access.workspaceId),
          isNull(customerSegments.deletedAt),
        ),
      )
      .orderBy(desc(customerSegments.createdAt));
    return Response.json(
      rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    );
  } catch (error) {
    if (error instanceof CustomerAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Não foi possível listar os segmentos." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value != null)
        formData.set(
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        );
    }
    const result = await createCustomerSegmentAction(formData);
    return Response.json(result, { status: result.ok ? 201 : 400 });
  } catch (error) {
    if (error instanceof CustomerAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Não foi possível criar o segmento." },
      { status: 500 },
    );
  }
}
