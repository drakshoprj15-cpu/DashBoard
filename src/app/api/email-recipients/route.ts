import { NextRequest } from "next/server";

import { searchEmailRecipients } from "@/features/emails/segments";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.demoMode) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const recipients = await searchEmailRecipients(query);
    return Response.json({ recipients });
  } catch (error) {
    console.error("[email-recipients] busca falhou", error);
    return Response.json(
      { error: "Não foi possível buscar clientes." },
      { status: 500 },
    );
  }
}
