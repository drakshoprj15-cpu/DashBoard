import type { Metadata } from "next";

import { LogsView } from "@/features/audit/logs-view";

export const metadata: Metadata = { title: "Logs" };

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Logs</h2>
        <p className="text-muted-foreground text-sm">
          Ações administrativas e webhooks recebidos, com filtro por período
        </p>
      </div>
      <LogsView />
    </div>
  );
}
