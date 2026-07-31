import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  Database,
  RotateCcw,
  ShoppingBag,
  XCircle,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listNotifications } from "@/features/notifications/queries";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions";
import { getPushcutStatus } from "@/features/notifications/pushcut";
import { PUSHCUT_SLOTS } from "@/features/notifications/pushcut-types";
import {
  testPushcutAction,
  togglePushcutAction,
} from "@/features/notifications/pushcut-actions";
import { PushcutForm } from "@/features/notifications/pushcut-form";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Notificações" };
export const dynamic = "force-dynamic";

const EVENT_ICON: Record<string, React.ElementType> = {
  payment_approved: CreditCard,
  payment_refused: XCircle,
  payment_pending: CreditCard,
  order_created: ShoppingBag,
  refund: RotateCcw,
  chargeback: AlertTriangle,
  webhook_error: AlertTriangle,
};

const EVENT_TONE: Record<string, string> = {
  payment_approved: "text-success",
  payment_refused: "text-destructive",
  payment_pending: "text-warning",
  order_created: "text-info",
  refund: "text-muted-foreground",
  chargeback: "text-destructive",
  webhook_error: "text-destructive",
};

export default async function NotificacoesPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para receber notificações."
        className="min-h-[420px]"
      />
    );
  }

  const [rows, pushcut] = await Promise.all([
    listNotifications(),
    getPushcutStatus(),
  ]);
  const unread = rows.filter((n) => !n.readAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Notificações</h2>
          <p className="text-muted-foreground text-sm">
            {unread.length > 0
              ? `${unread.length} por ler`
              : "Tudo lido"}{" "}
            · geradas automaticamente pelos eventos do gateway
          </p>
        </div>
        {unread.length > 0 && (
          <form action={markAllNotificationsReadAction}>
            <Button variant="outline" type="submit">
              <CheckCheck /> Marcar todas como lidas
            </Button>
          </form>
        )}
      </div>

      {/* Pushcut */}
      <div id="pushcut" className="scroll-mt-20 space-y-3">
        <PushcutForm status={pushcut} />

        {pushcut.configured && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm">
            <Badge variant={pushcut.isActive ? "success" : "muted"}>
              {pushcut.isActive ? "Ativo" : "Pausado"}
            </Badge>
            {pushcut.lastEventAt && (
              <span className="text-muted-foreground text-xs">
                Último envio: {formatDateTime(pushcut.lastEventAt, "pt-PT")}
              </span>
            )}
            {pushcut.lastError && (
              <span className="text-destructive text-xs">
                {pushcut.lastError}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {PUSHCUT_SLOTS.filter(
                (slot) => pushcut.slots[slot.key].configured,
              ).map((slot) => (
                <form key={slot.key} action={testPushcutAction}>
                  <input type="hidden" name="slot" value={slot.key} />
                  <Button size="sm" variant="outline" type="submit">
                    Testar {slot.label.toLowerCase()}
                  </Button>
                </form>
              ))}
              <form action={togglePushcutAction}>
                <input
                  type="hidden"
                  name="active"
                  value={String(!pushcut.isActive)}
                />
                <Button size="sm" variant="ghost" type="submit">
                  {pushcut.isActive ? "Pausar" : "Reativar"}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhuma notificação ainda"
          description="Quando um pagamento for confirmado, recusado ou houver erro de webhook, aparece aqui automaticamente."
          className="min-h-[320px]"
        />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => {
            const Icon = EVENT_ICON[n.eventType] ?? Bell;
            const isUnread = !n.readAt;

            return (
              <Card
                key={n.id}
                className={cn("py-4", isUnread && "border-primary/40 bg-accent/20")}
              >
                <CardContent className="flex flex-wrap items-start gap-3 px-4">
                  <Icon
                    className={cn(
                      "mt-0.5 size-5 shrink-0",
                      EVENT_TONE[n.eventType] ?? "text-muted-foreground",
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{n.title}</p>
                      {isUnread && <Badge variant="info">Nova</Badge>}
                      {n.valueCents !== null && (
                        <Badge variant="success">
                          {formatMoney(n.valueCents, "EUR", "pt-PT")}
                        </Badge>
                      )}
                    </div>
                    {n.body && (
                      <p className="text-muted-foreground mt-0.5 text-sm">
                        {n.body}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {formatDateTime(n.createdAt, "pt-PT")}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {n.href && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={n.href}>Abrir</Link>
                      </Button>
                    )}
                    {isUnread && (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <Button size="sm" variant="ghost" type="submit">
                          <CheckCheck />
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
