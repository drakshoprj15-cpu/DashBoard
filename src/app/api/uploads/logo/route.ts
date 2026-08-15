import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/database/client";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import {
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from "@/lib/workspace-access";
import {
  SAFE_IMAGE_MIME_TYPES,
  validateRasterImage,
} from "@/lib/uploads/image-validation";

const BUCKET = "logos";
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB

/** Garante que o bucket público existe — cria na primeira chamada. */
async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await admin.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE_BYTES,
    allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
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
    return NextResponse.json(
      { error: "Nenhum arquivo enviado." },
      { status: 400 },
    );
  }

  const validated = await validateRasterImage(file, MAX_SIZE_BYTES);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const { workspaceId } = await requireWorkspaceAccess([
      "owner",
      "admin",
      "marketing",
    ]);
    const admin = createAdminClient();
    await ensureBucket(admin);

    const path = `${workspaceId}/${Date.now()}-${crypto.randomUUID()}.${validated.extension}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, validated.bytes, {
        contentType: validated.contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json(
        { error: "Sem permissão para enviar imagens." },
        { status: 403 },
      );
    }
    console.error("[uploads] erro ao enviar logo:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar a imagem. Tente novamente." },
      { status: 500 },
    );
  }
}
