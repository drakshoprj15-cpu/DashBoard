"use client";

import { useState, useTransition } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  deletePixelAction,
  saveLandingPagePixelsAction,
  testPixelConnectionAction,
} from "@/features/pixels/actions";
import type { PixelRow } from "@/features/pixels/types";
import { PixelIntegrationRow, type PixelRowState } from "./pixel-integration-row";

function toRowState(p: PixelRow): PixelRowState {
  return {
    key: p.id,
    id: p.id,
    type: p.type === "meta_capi" ? "meta_capi" : "meta_pixel",
    pixelId: p.pixelId ?? "",
    token: p.tokenPreview ?? "",
    testEventCode: p.testEventCode ?? "",
    isActive: p.isActive,
    connectionStatus: p.connectionStatus,
    lastTestedAt: p.lastTestedAt ? new Date(p.lastTestedAt).toISOString() : null,
    lastTestError: p.lastTestError,
    showToken: false,
    testing: false,
  };
}

function emptyRow(type: PixelRowState["type"]): PixelRowState {
  return {
    key: crypto.randomUUID(),
    type,
    pixelId: "",
    token: "",
    testEventCode: "",
    isActive: true,
    connectionStatus: "not_tested",
    lastTestedAt: null,
    lastTestError: null,
    showToken: true,
    testing: false,
  };
}

interface PixelIntegrationListProps {
  landingPageId: string;
  initialPixels: PixelRow[];
}

/**
 * Lista editável dos pixels Meta de uma landing page. Salva tudo de uma vez
 * (`saveLandingPagePixelsAction`) — excluir é imediato e separado
 * (`deletePixelAction`, já com confirmação do navegador).
 */
export function PixelIntegrationList({
  landingPageId,
  initialPixels,
}: PixelIntegrationListProps) {
  // O componente é remontado com `key={landingPageId}` pelo pai
  // (`meta-pixel-page.tsx`) sempre que a landing page selecionada muda — o
  // estado inicial abaixo já nasce correto, sem precisar de um efeito para
  // resincronizar `rows` a cada troca.
  const [rows, setRows] = useState<PixelRowState[]>(() =>
    initialPixels.map(toRowState),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();

  function updateRow(key: string, patch: Partial<PixelRowState>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function addRow(type: PixelRowState["type"]) {
    setRows((prev) => [...prev, emptyRow(type)]);
    setDirty(true);
  }

  async function removeRow(row: PixelRowState) {
    if (row.id) {
      const confirmed = window.confirm(
        "Remover este pixel? Esta ação não pode ser desfeita.",
      );
      if (!confirmed) return;
      const formData = new FormData();
      formData.set("id", row.id);
      await deletePixelAction(formData);
      toast.success("Pixel removido.");
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  }

  async function testRow(row: PixelRowState) {
    if (!row.id) {
      toast.error("Salve o pixel antes de testar a conexão.");
      return;
    }
    updateRow(row.key, { testing: true });
    const result = await testPixelConnectionAction(row.id);
    updateRow(row.key, {
      testing: false,
      connectionStatus: result.status ?? "connection_error",
      lastTestError: result.ok ? null : (result.message ?? null),
      lastTestedAt: new Date().toISOString(),
    });
    if (result.ok) toast.success(result.message ?? "Conexão confirmada.");
    else toast.error(result.message ?? "Falha ao testar a conexão.");
  }

  function handleSave() {
    startSaving(async () => {
      const result = await saveLandingPagePixelsAction(
        landingPageId,
        rows.map((r) => ({
          id: r.id,
          type: r.type,
          pixelId: r.pixelId,
          token: r.token || undefined,
          testEventCode: r.testEventCode || undefined,
          isActive: r.isActive,
        })),
      );
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar.");
        return;
      }
      toast.success(result.message ?? "Configurações salvas.");
      setDirty(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum pixel específico cadastrado para esta landing page — os
            pixels globais do workspace serão usados.
          </p>
        ) : (
          rows.map((row) => (
            <PixelIntegrationRow
              key={row.key}
              row={row}
              onChange={(patch) => updateRow(row.key, patch)}
              onRemove={() => removeRow(row)}
              onTest={() => testRow(row)}
            />
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addRow("meta_pixel")}
        >
          <Plus /> Adicionar Meta Pixel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addRow("meta_capi")}
        >
          <Plus /> Adicionar Conversions API
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          type="button"
          onClick={handleSave}
          loading={saving}
          disabled={rows.length === 0}
        >
          <Save /> Salvar configurações
        </Button>
        {dirty ? (
          <span className="text-warning text-xs font-medium">
            Alterações não salvas
          </span>
        ) : null}
      </div>
    </div>
  );
}
