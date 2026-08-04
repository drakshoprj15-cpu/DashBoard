"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";

import {
  updateBrandingAction,
  type BrandingActionResult,
} from "@/features/branding/actions";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dados da loja</CardTitle>
        <CardDescription>
          Nome, logo e contacto exibidos no cabeçalho e rodapé do checkout e das
          landing pages públicas.
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
            label="Logo da loja"
            value={logoUrl}
            onChange={setLogoUrl}
          />
          <p className="text-muted-foreground -mt-2 text-xs">
            Aparece centralizada no banner das landing pages e do checkout. Sem
            logo, mostra o nome da loja.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="storeName">Nome da loja</Label>
              <Input
                id="storeName"
                name="storeName"
                defaultValue={initial.storeName}
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
