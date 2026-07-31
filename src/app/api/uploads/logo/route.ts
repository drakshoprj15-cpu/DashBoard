import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/database/client";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

const BUCKET = "logos";
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/** Garante que o bucket público existe — cria na primeira chamada. */
async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await admin.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE_BYTES,
  });
  // Corrida entre duas requisições simultâneas na primeira chamada: ignora
  // "already exists", propaga qualquer outro erro real.
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

/**
 * Upload genérico de logo (loja, checkout, etc.) para o Storage público do
 * Supabase. Rota protegida pelo proxy (não está em PUBLIC_PREFIXES) — só
 * acessível com sessão válida do painel.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado." },
      { status: 503 },
    );
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Upload de imagem não configurado — falta SUPABASE_SERVICE_ROLE_KEY no ambiente.",
      },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Formato inválido. Use PNG, JPEG, WebP ou SVG." },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Imagem muito grande — máximo de 3 MB." },
      { status: 400 },
    );
  }

  try {
    const workspaceId = await getOrCreateDefaultWorkspace();
    const admin = createAdminClient();
    await ensureBucket(admin);

    const path = `${workspaceId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    console.error("[uploads] erro ao enviar logo:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar a imagem. Tente novamente." },
      { status: 500 },
    );
  }
}
