/**
 * Allowlist de donos autorizados a abrir o painel.
 *
 * A `anon key` do Supabase é pública por natureza (vai no bundle do browser),
 * então qualquer pessoa pode chamar a API de cadastro do Supabase diretamente
 * e criar uma conta — mesmo com o formulário de cadastro desativado aqui.
 * Esta allowlist é a barreira final: mesmo com credenciais válidas, só os
 * e-mails listados em OWNER_EMAILS recebem sessão no painel.
 *
 * Vazia = sem restrição por e-mail; o acesso continua limitado à associação de
 * workspace, e /configuracoes avisa que a trava está desligada.
 */
export function getOwnerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerAllowlistEnabled(): boolean {
  return getOwnerEmails().length > 0;
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  const allowlist = getOwnerEmails();
  if (allowlist.length === 0) return true;

  return allowlist.includes((email ?? "").trim().toLowerCase());
}
