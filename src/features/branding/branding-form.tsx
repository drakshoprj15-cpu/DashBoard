"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";

import {
  updateBrandingAction,
  type BrandingActionResult,
} from "@/features/branding/actions";
import { CheckoutBrand } from "@/features/branding/checkout-brand";
import type { WorkspaceBranding } from "@/features/branding/queries";
import { LogoDropzone } from "@/components/logo-dropzone";
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

export function BrandingForm({ initial }: { initial: WorkspaceBranding }) {
  const [state, formAction, pending] = useActionState<
    BrandingActionResult | null,
    FormData
  >(updateBrandingAction, null);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [storeName, setStoreName] = useState(
    initial.storeName.trim() || "Minha Loja",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identidade da loja</CardTitle>
        <CardDescription>
          Defina o nome e a logo próprios exibidos no cabeçalho e rodapé do
          checkout. Você poderá trocar a imagem sempre que precisar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="logoUrl" value={logoUrl} />

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

          <LogoDropzone
            id="branding-logoUrl"
            label="Logo padrão do checkout"
            value={logoUrl}
            onChange={setLogoUrl}
          />
          <p className="text-muted-foreground -mt-2 text-xs">
            Use uma marca própria. Sem imagem, o checkout mostra “Minha Loja” ou
            o nome definido abaixo.
          </p>

          <div className="space-y-2 rounded-xl border p-4">
            <p className="text-muted-foreground text-xs font-medium">
              Pré-visualização do cabeçalho
            </p>
            <div
              className="flex h-[65px] items-center justify-center rounded-lg px-4"
              style={{ backgroundColor: "#e30613" }}
            >
              <CheckoutBrand logoUrl={logoUrl} storeName={storeName} />
            </div>
            <p className="text-muted-foreground text-[11px]">
              Área da logo: até 122 × 25 px, centralizada no celular e no
              computador.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="storeName">Nome da loja</Label>
              <Input
                id="storeName"
                name="storeName"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                placeholder="Ex.: Minha Loja"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supportEmail">E-mail de suporte</Label>
              <Input
                id="supportEmail"
                name="supportEmail"
                type="email"
                defaultValue={initial.supportEmail ?? ""}
                placeholder="apoio@minhaloja.pt"
              />
            </div>
          </div>

          <Button type="submit" loading={pending}>
            <Save /> Salvar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
