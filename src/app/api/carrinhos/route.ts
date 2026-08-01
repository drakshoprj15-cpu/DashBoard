import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/database/client";
import { getCartsFacets, listCarts } from "@/features/carts/queries";
import { parseCartFilters } from "@/app/api/carrinhos/filters";

export const dynamic = "force-dynamic";

/**
 * Lista de Carrinhos (pedidos), com busca/filtros/paginação processados no
 * backend, mais o resumo (cards + contagem das abas). Dados pessoais de
 * clientes exigem sessão autenticada real — nunca acessível em modo demo.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseCartFilters(searchParams);

  const [list, facets] = await Promise.all([
    listCarts(filters),
    getCartsFacets(filters),
  ]);

  return NextResponse.json({ ...list, facets });
}
