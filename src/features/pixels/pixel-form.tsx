"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";

import {
  savePixelAction,
  type PixelActionResult,
} from "@/features/pixels/actions";
import { PIXEL_TYPE_INFO, type PixelType } from "@/features/pixels/types";
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

const SELECTABLE: PixelType[] = [
  "meta_pixel",
  "meta_capi",
  "ga4",
  "gtm",
  "google_ads",
  "tiktok_pixel",
  "utmify",
];

export function PixelForm() {
  const [state, formAction, pending] = useActionState<
    PixelActionResult | null,
    FormData
  >(savePixelAction, null);
  const [type, setType] = React.useState<PixelType>("meta_pixel");

  const info = PIXEL_TYPE_INFO[type];
  const needsToken = type === "meta_capi" || type === "utmify";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Adicionar pixel</CardTitle>
        <CardDescription>
          O pixel passa a disparar automaticamente nas suas landing pages e no
          checkout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
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
              <Label htmlFor="type">Plataforma</Label>
              <select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as PixelType)}
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                {SELECTABLE.map((t) => (
                  <option key={t} value={t}>
                    {PIXEL_TYPE_INFO[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome interno</Label>
              <Input
                id="name"
                name="name"
                placeholder="Ex.: Meta — TechNébula"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pixelId">{info.idLabel}</Label>
              <Input
                id="pixelId"
                name="pixelId"
                placeholder={info.idPlaceholder}
                required
              />
              <p className="text-muted-foreground text-xs">{info.helper}</p>
            </div>

            {needsToken && (
              <div className="space-y-2">
                <Label htmlFor="token">
                  {type === "utmify" ? "Token de API (x-api-token)" : "Token de acesso"}
                </Label>
                <Input
                  id="token"
                  name="token"
                  type="password"
                  placeholder={type === "utmify" ? "utm_..." : "EAAG..."}
                  required
                />
                <p className="text-muted-foreground text-xs">
                  {type === "utmify"
                    ? "Gerado no painel da UTMify: Integrações → Webhooks → Credenciais de API → Adicionar credencial."
                    : "Guardado criptografado. Nunca é enviado ao navegador."}
                </p>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked
              className="accent-primary size-4"
            />
            Ativar imediatamente
          </label>

          <Button type="submit" loading={pending}>
            <Plus /> Salvar pixel
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
