"use client";

import { Eye, EyeOff, Loader2, Trash2, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ID_PATTERNS } from "@/validations/pixel";
import type { PixelConnectionStatus } from "@/features/pixels/types";
import { MetaConnectionStatusBadge } from "./meta-connection-status-badge";

export interface PixelRowState {
  /** chave estável só do cliente — nunca enviada ao servidor */
  key: string;
  id?: string;
  type: "meta_pixel" | "meta_capi";
  pixelId: string;
  token: string;
  testEventCode: string;
  isActive: boolean;
  connectionStatus: PixelConnectionStatus;
  lastTestedAt: string | null;
  lastTestError: string | null;
  showToken: boolean;
  testing: boolean;
}

interface PixelIntegrationRowProps {
  row: PixelRowState;
  onChange: (patch: Partial<PixelRowState>) => void;
  onRemove: () => void;
  onTest: () => void;
}

export function PixelIntegrationRow({
  row,
  onChange,
  onRemove,
  onTest,
}: PixelIntegrationRowProps) {
  const pixelIdError =
    row.pixelId && !ID_PATTERNS.meta_pixel.regex.test(row.pixelId)
      ? ID_PATTERNS.meta_pixel.message
      : null;
  const tokenMissing = row.type === "meta_capi" && !row.token;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {row.type === "meta_capi" ? "Meta Conversions API" : "Meta Pixel"}
        </span>
        <div className="flex items-center gap-2">
          <MetaConnectionStatusBadge status={row.connectionStatus} />
          <Switch
            checked={row.isActive}
            onCheckedChange={(checked) => onChange({ isActive: checked })}
            aria-label="Pixel ativo"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`pixel-id-${row.key}`}>ID do Pixel</Label>
          <Input
            id={`pixel-id-${row.key}`}
            inputMode="numeric"
            placeholder="1234567890123456"
            value={row.pixelId}
            onChange={(e) => onChange({ pixelId: e.target.value.trim() })}
            aria-invalid={Boolean(pixelIdError)}
          />
          {pixelIdError ? (
            <p className="text-destructive text-xs">{pixelIdError}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`pixel-token-${row.key}`}>
            Token da API de Conversões
            {row.type === "meta_capi" ? "" : " (opcional)"}
          </Label>
          <div className="relative">
            <Input
              id={`pixel-token-${row.key}`}
              type={row.showToken ? "text" : "password"}
              placeholder="EAAJ…"
              value={row.token}
              onChange={(e) => onChange({ token: e.target.value })}
              aria-invalid={tokenMissing}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => onChange({ showToken: !row.showToken })}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label={row.showToken ? "Ocultar token" : "Mostrar token"}
            >
              {row.showToken ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {tokenMissing ? (
            <p className="text-destructive text-xs">
              A API de Conversões exige o token de acesso.
            </p>
          ) : null}
        </div>
      </div>

      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer select-none">
          Modo de teste
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor={`test-code-${row.key}`}>
              Código de evento de teste
            </Label>
            <Input
              id={`test-code-${row.key}`}
              placeholder="TEST12345"
              value={row.testEventCode}
              onChange={(e) => onChange({ testEventCode: e.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={row.testing || !row.id}
          >
            {row.testing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Wifi className="size-4" />
            )}
            Testar conexão
          </Button>
        </div>
        {!row.id ? (
          <p className="text-muted-foreground mt-1 text-xs">
            Salve este pixel antes de testar a conexão.
          </p>
        ) : row.lastTestedAt ? (
          <p className="text-muted-foreground mt-1 text-xs">
            Último teste: {new Date(row.lastTestedAt).toLocaleString("pt-BR")}
            {row.lastTestError ? ` — ${row.lastTestError}` : ""}
          </p>
        ) : null}
      </details>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 /> Remover
        </Button>
      </div>
    </div>
  );
}
