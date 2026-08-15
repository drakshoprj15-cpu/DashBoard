"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Save, TestTube2 } from "lucide-react";

import {
  saveUtmifyIntegrationAction,
  testUtmifyConnectionAction,
  type UtmifyActionState,
} from "@/features/pixels/utmify-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  integration: {
    name: string;
    credentialName: string;
    platform: string;
    tokenPreview: string;
    isActive: boolean;
  } | null;
}

const initial: UtmifyActionState = { ok: false, message: "" };

export function UtmifyForm({ integration }: Props) {
  const [showToken, setShowToken] = useState(false);
  const [saveState, saveAction, saving] = useActionState(saveUtmifyIntegrationAction, initial);
  const [testState, testAction, testing] = useActionState(testUtmifyConnectionAction, initial);

  return (
    <div className="space-y-4">
      {(saveState.message || testState.message) && (
        <Alert variant={(saveState.ok || testState.ok) ? "success" : "destructive"}>
          {(saveState.ok || testState.ok) ? <CheckCircle2 /> : null}
          <AlertDescription>{testState.message || saveState.message}</AlertDescription>
        </Alert>
      )}
      <form action={saveAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="utmify-name">Nome interno da integração</Label>
            <Input id="utmify-name" name="name" defaultValue={integration?.name ?? "UTMify principal"} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="utmify-credential">Nome da credencial</Label>
            <Input id="utmify-credential" name="credentialName" defaultValue={integration?.credentialName ?? "Credencial principal"} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="utmify-platform">Identificador da plataforma</Label>
            <Input id="utmify-platform" name="platform" defaultValue={integration?.platform ?? "Infinity"} pattern="[A-Z][A-Za-z0-9]{1,49}" required />
            <p className="text-muted-foreground text-xs">Use um nome consistente em PascalCase, como Infinity.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="utmify-token">Token da API (x-api-token)</Label>
            <div className="relative">
              <Input
                id="utmify-token"
                name="token"
                type={showToken ? "text" : "password"}
                placeholder={integration ? `${integration.tokenPreview} · deixe vazio para manter` : "Cole o token criado na UTMify"}
                autoComplete="new-password"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowToken((value) => !value)} className="text-muted-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center" aria-label={showToken ? "Ocultar token" : "Mostrar token"}>
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-muted-foreground text-xs">Depois de salvo, o token completo nunca volta ao navegador.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={integration?.isActive ?? true} className="accent-primary size-4" />
          Status ativo
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving}><Save /> Salvar e ativar</Button>
          <Button type="submit" formAction={testAction} variant="outline" disabled={testing}>
            {testing ? <Loader2 className="animate-spin" /> : <TestTube2 />} {testing ? "Testando" : "Testar conexão"}
          </Button>
        </div>
      </form>
    </div>
  );
}
