"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isOwnerEmail } from "@/lib/auth/owner";
import { getAppUrl } from "@/lib/app-url";
import { loginSchema, forgotPasswordSchema } from "@/validations/auth";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const NOT_CONFIGURED_ERROR =
  "O Supabase ainda não está configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
  "Enquanto isso, o painel está disponível em modo demonstração.";

export async function loginAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      ok: false,
      error:
        error.code === "invalid_credentials"
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar. Tente novamente.",
    };
  }

  // Credenciais corretas não garantem acesso: contas fora da allowlist são
  // desconectadas aqui, senão ficariam presas em redirect entre / e /login.
  if (!isOwnerEmail(parsed.data.email)) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Esta conta não tem acesso ao painel.",
    };
  }

  const redirectTo = formData.get("redirect");
  redirect(
    typeof redirectTo === "string" && redirectTo.startsWith("/")
      ? redirectTo
      : "/dashboard",
  );
}

/**
 * Autocadastro desativado: este painel é de uso privado (um único dono).
 * Novos acessos são concedidos manualmente pelo Supabase Auth, nunca por
 * formulário público — evita que qualquer visitante crie conta sozinho.
 */
export async function registerAction(
  _prev: AuthActionResult | null,
  _formData: FormData,
): Promise<AuthActionResult> {
  return {
    ok: false,
    error:
      "O cadastro está desativado. Este painel é de uso privado — peça acesso ao administrador.",
  };
}

export async function forgotPasswordAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();
  const appUrl = getAppUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${appUrl}/auth/redefinir-senha` },
  );

  if (error) {
    return {
      ok: false,
      error: "Não foi possível enviar o e-mail. Tente novamente.",
    };
  }

  return {
    ok: true,
    message:
      "Se existir uma conta com este e-mail, você receberá um link de recuperação.",
  };
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
