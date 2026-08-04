import type { Metadata } from "next";
import { Database } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getPushcutStatus } from "@/features/notifications/pushcut";
import { PUSHCUT_SLOTS } from "@/features/notifications/pushcut-types";
import { togglePushcutAction } from "@/features/notifications/pushcut-actions";
import { LegacyPushcutHashCleanup } from "@/features/notifications/legacy-pushcut-hash-cleanup";
import { PushcutForm } from "@/features/notifications/pushcut-form";
import { PushcutTestButton } from "@/features/notifications/pushcut-test-button";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Pushcut" };
export const dynamic = "force-dynamic";

export default async function PushcutsPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Conecte o Supabase para configurar as notificações Pushcut."
        className="min-h-[420px]"
      />
    );
  }

  const pushcut = await getPushcutStatus();

  return (
    <div className="space-y-6">
      <LegacyPushcutHashCleanup />

      <div>
        <h2 className="text-xl font-bold tracking-tight">Pushcut</h2>
        <p className="text-muted-foreground text-sm">
          Receba no celular notificações dos eventos de vendas e pagamentos.
        </p>
      </div>

      <PushcutForm status={pushcut} />

      {pushcut.configured && (
        <div className="space-y-3 rounded-xl border px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={pushcut.isActive ? "success" : "muted"}>
              {pushcut.isActive ? "Ativo" : "Pausado"}
            </Badge>
            {pushcut.lastEventAt && (
              <span className="text-muted-foreground text-xs">
                Último envio: {formatDateTime(pushcut.lastEventAt, "pt-PT")}
              </span>
            )}
            {pushcut.lastError && (
              <span className="text-destructive text-xs" role="alert">
                {pushcut.lastError}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-2">
            {PUSHCUT_SLOTS.filter(
              (slot) => pushcut.slots[slot.key].configured,
            ).map((slot) => (
              <PushcutTestButton
                key={slot.key}
                slot={slot.key}
                label={slot.label}
              />
            ))}

            <form action={togglePushcutAction}>
              <input
                type="hidden"
                name="active"
                value={String(!pushcut.isActive)}
              />
              <Button size="sm" variant="ghost" type="submit">
                {pushcut.isActive ? "Pausar integração" : "Reativar integração"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
