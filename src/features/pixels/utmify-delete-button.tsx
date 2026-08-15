"use client";

import { Trash2 } from "lucide-react";

import { deleteUtmifyIntegrationAction } from "@/features/pixels/utmify-actions";
import { Button } from "@/components/ui/button";

export function UtmifyDeleteButton() {
  return (
    <form
      action={deleteUtmifyIntegrationAction}
      onSubmit={(event) => {
        if (!window.confirm("Excluir a integração UTMify e todo o histórico de entregas? Esta ação não pode ser desfeita.")) {
          event.preventDefault();
        }
      }}
    >
      <Button size="sm" variant="ghost" className="text-destructive" type="submit">
        <Trash2 /> Excluir integração
      </Button>
    </form>
  );
}
