/**
 * Verificação central de configuração do Supabase.
 *
 * Enquanto as credenciais não existirem, a aplicação roda em
 * "modo demonstração": o painel abre com banner permanente e o login
 * real fica indisponível (com instruções claras de configuração).
 * Nada finge estar conectado.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * O "modo demonstração" abre o painel sem login. Por segurança ele só é
 * permitido quando explicitamente habilitado (ALLOW_DEMO_MODE=true).
 * Sem essa flag, e sem Supabase configurado, o painel exige login sempre —
 * nunca abre sozinho para um visitante.
 */
export function isDemoModeAllowed(): boolean {
  return process.env.ALLOW_DEMO_MODE === "true";
}
