import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase administrativo (service role key) — só para o servidor.
 *
 * Diferente de `server.ts` (anon key, sujeito a RLS/sessão do utilizador),
 * este cliente ignora RLS. Usar apenas para operações administrativas de
 * confiança, como upload para buckets de Storage a partir de rotas já
 * protegidas pelo proxy de autenticação. Nunca importar num Client Component.
 */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin não configurado — falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
