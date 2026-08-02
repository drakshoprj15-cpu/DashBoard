"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Smartphone } from "lucide-react";

import {
  savePushcutAction,
  type PushcutActionResult,
} from "@/features/notifications/pushcut-actions";
import {
  PUSHCUT_EVENTS,
  PUSHCUT_SLOTS,
  PUSHCUT_WEBHOOK_URL_PLACEHOLDER,
  type PushcutStatus,
} from "@/features/notifications/pushcut-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

export function PushcutForm({ status }: { status: PushcutStatus }) {
  const [state, formAction, pending] = useActionState<
    PushcutActionResult | null,
    FormData
  >(savePushcutAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="size-4" /> Pushcut — push no telemóvel
        </CardTitle>
        <CardDescription>
          Dois canais separados: um alerta quando a venda é gerada e outro
          quando o pagamento é confirmado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info">
          <AlertCircle />
          <AlertDescription>
            Na app Pushcut, crie <strong>duas Notifications</strong> (ex.:{" "}
            <code className="font-mono text-xs">Venda gerada</code> e{" "}
            <code className="font-mono text-xs">Venda aprovada</code>) para
            cada uma poder ter som e ícone próprios. Em cada Notification,
            abra <strong>Webhook URL</strong> e copie o endereço completo —
            <em> não</em> é a &ldquo;Account → API key&rdquo;. Cole aqui a URL
            copiada diretamente do aplicativo Pushcut; ela será guardada de
            forma criptografada e nunca mostrada de novo por completo.
          </AlertDescription>
        </Alert>

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

          <div className="grid gap-4 lg:grid-cols-2">
            {PUSHCUT_SLOTS.map((slot) => {
              const current = status.slots[slot.key];

              return (
                <div key={slot.key} className="space-y-4 rounded-xl border p-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{slot.label}</h3>
                      <Badge variant={current.configured ? "success" : "muted"}>
                        {current.configured ? "Webhook configurado" : "Sem webhook"}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {slot.description}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${slot.key}_webhookUrl`}>
                      URL do webhook Pushcut
                    </Label>
                    <Input
                      id={`${slot.key}_webhookUrl`}
                      name={`${slot.key}_webhookUrl`}
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      autoCapitalize="none"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      placeholder={
                        current.configured
                          ? `${current.maskedUrl} (deixe vazio para manter)`
                          : PUSHCUT_WEBHOOK_URL_PLACEHOLDER
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Cole aqui a URL copiada diretamente do aplicativo
                      Pushcut. É guardada de forma criptografada — nunca é
                      devolvida ao navegador depois de salva.
                    </p>
                    {current.configured && current.maskedUrl && (
                      <p className="font-mono text-xs">{current.maskedUrl}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Avisar quando</Label>
                    <div className="space-y-1.5">
                      {PUSHCUT_EVENTS.map((e) => (
                        <label
                          key={e.value}
                          className="flex items-start gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name={`${slot.key}_events`}
                            value={e.value}
                            defaultChecked={current.events.includes(e.value)}
                            className="accent-primary mt-0.5 size-4"
                          />
                          <span>
                            {e.label}
                            {e.hint && (
                              <span className="text-muted-foreground block text-xs">
                                {e.hint}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Sem nenhum evento marcado, este canal fica desligado.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <Button type="submit" loading={pending}>
            {status.configured ? "Atualizar e testar" : "Ligar e enviar teste"}
          </Button>
          <p className="text-muted-foreground text-xs">
            Ao guardar, enviamos um push real por cada canal ativo — se algo
            estiver errado, você descobre agora e não numa venda.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
