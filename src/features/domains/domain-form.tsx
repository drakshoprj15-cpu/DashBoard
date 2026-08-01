"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Globe } from "lucide-react";

import {
  saveDomainAction,
  type DomainActionResult,
} from "@/features/domains/actions";
import type { ProductOption } from "@/features/products/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DomainForm({ products }: { products: ProductOption[] }) {
  const [state, formAction, pending] = useActionState<
    DomainActionResult | null,
    FormData
  >(saveDomainAction, null);
  // Formulário não-controlado: ao guardar, a `key` muda e o React remonta
  // os campos já limpos (mesmo padrão do formulário de avaliações).
  const formKey = state?.ok ? `saved-${state.message ?? ""}` : "novo";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Novo domínio</CardTitle>
        <CardDescription>
          Cole o domínio como aparece no navegador. Cadastrar o mesmo domínio
          outra vez apenas troca o produto servido nele.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={formKey} action={formAction} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && state.message && (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hostname">Domínio</Label>
              <Input
                id="hostname"
                name="hostname"
                required
                placeholder="minhaloja.online"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="productId">Produto na raiz do domínio</Label>
              <select
                id="productId"
                name="productId"
                defaultValue=""
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                <option value="">Nenhum (só /p/slug e checkout)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Com um produto escolhido, abrir o domínio já mostra a landing
                dele — é essa a URL para usar nos anúncios.
              </p>
            </div>
          </div>

          <Button type="submit" disabled={pending}>
            <Globe /> {pending ? "A guardar…" : "Adicionar domínio"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
