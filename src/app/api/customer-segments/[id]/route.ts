import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/database/client";
import { customerSegments } from "@/database/schema";
import { recordAuditLog } from "@/features/audit/log";
import {
  CustomerAccessError,
  requireCustomerPermission,
} from "@/features/customers/access";

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    type: z.enum(["dynamic", "static"]).optional(),
    rules: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireCustomerPermission("manage_segments");
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      return Response.json({ error: "Alterações inválidas." }, { status: 400 });
    const { id } = await params;
    const [updated] = await getDb()
      .update(customerSegments)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(customerSegments.id, id),
          eq(customerSegments.workspaceId, access.workspaceId),
          isNull(customerSegments.deletedAt),
        ),
      )
      .returning({ id: customerSegments.id });
    if (!updated)
      return Response.json(
        { error: "Segmento não encontrado." },
        { status: 404 },
      );
    await recordAuditLog({
      action: "customer_segment.updated",
      entityType: "customer_segment",
      entityId: id,
      changes: { fields: Object.keys(parsed.data) },
      workspaceId: access.workspaceId,
      actorId: access.userId,
    });
    return Response.json({ ok: true, message: "Segmento atualizado." });
  } catch (error) {
    if (error instanceof CustomerAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Não foi possível atualizar o segmento." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireCustomerPermission("manage_segments");
    const { id } = await params;
    const [deleted] = await getDb()
      .update(customerSegments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(customerSegments.id, id),
          eq(customerSegments.workspaceId, access.workspaceId),
          isNull(customerSegments.deletedAt),
        ),
      )
      .returning({ id: customerSegments.id });
    if (!deleted)
      return Response.json(
        { error: "Segmento não encontrado." },
        { status: 404 },
      );
    await recordAuditLog({
      action: "customer_segment.deleted",
      entityType: "customer_segment",
      entityId: id,
      changes: {},
      workspaceId: access.workspaceId,
      actorId: access.userId,
    });
    return Response.json({ ok: true, message: "Segmento excluído." });
  } catch (error) {
    if (error instanceof CustomerAccessError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Não foi possível excluir o segmento." },
      { status: 500 },
    );
  }
}
