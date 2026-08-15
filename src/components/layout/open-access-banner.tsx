import { ShieldAlert } from "lucide-react";

/**
 * Banner permanente de acesso irrestrito — visível quando o painel roda com
 * Supabase real mas sem `OWNER_EMAILS`.
 *
 * Nesse estado qualquer conta criada no projeto Supabase consegue autenticar
 * (a `anon key` é pública, então o cadastro pela API do Supabase não depende
 * deste app). O aviso existe porque a falha é silenciosa: sem ele, o painel
 * parece protegido e o dono só descobre o contrário quando alguém entra.
 */
export function OpenAccessBanner() {
  return (
    <div className="bg-destructive/15 text-destructive flex items-center gap-2 border-b px-4 py-2 text-xs md:px-6">
      <ShieldAlert className="size-3.5 shrink-0" />
      <span>
        <strong>Acesso não restrito:</strong> qualquer conta criada no seu
        projeto Supabase consegue entrar neste painel. Defina{" "}
        <code className="font-mono">OWNER_EMAILS</code> com o seu e-mail no
        ambiente (instruções em docs/DEPLOY.md, secção 2.1).
      </span>
    </div>
  );
}
