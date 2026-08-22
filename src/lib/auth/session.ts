import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, isDemoModeAllowed } from "@/lib/supabase/config";
import { isOwnerEmail } from "@/lib/auth/owner";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export const DEMO_USER: SessionUser = {
  id: "demo-user",
  email: "demo@infinity.app",
  name: "Usuário Demo",
};

export interface AppSession {
  user: SessionUser;
  /** true quando o Supabase não está configurado e a sessão é fictícia */
  demoMode: boolean;
}

/**
 * Resolve a sessão atual no servidor.
 * - Supabase configurado: exige usuário autenticado (retorna null se não houver).
 * - Supabase ausente + ALLOW_DEMO_MODE=true: sessão de demonstração (demoMode=true).
 * - Supabase ausente sem a flag: retorna null → o painel exige login e nunca
 *   abre sozinho para um visitante.
 */
export async function getSession(): Promise<AppSession | null> {
  if (!isSupabaseConfigured()) {
    return isDemoModeAllowed() ? { user: DEMO_USER, demoMode: true } : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Conta válida no Supabase não basta: se houver allowlist, o e-mail precisa
  // constar nela. Sem isso, quem criar conta direto na API do Supabase entraria.
  if (!isOwnerEmail(user.email)) return null;

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      name:
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split("@")[0] ??
        "Usuário",
    },
    demoMode: false,
  };
}
