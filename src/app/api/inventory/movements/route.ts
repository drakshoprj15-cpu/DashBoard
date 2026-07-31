import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { listInventoryMovements } from "@/features/inventory/queries";

export const dynamic = "force-dynamic";

/** Histórico de movimentações de um produto — usado pelo Sheet de ajuste. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  const movements = await listInventoryMovements(productId);
  return NextResponse.json({ movements });
}
