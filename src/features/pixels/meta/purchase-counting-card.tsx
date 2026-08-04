"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updatePurchaseRuleAction } from "@/features/pixels/actions";

interface PurchaseCountingCardProps {
  /** `null` = configuração global do workspace */
  landingPageId: string | null;
  initialValue: boolean;
  initialHasOverride?: boolean;
}

/**
 * Switch "contar pedidos gerados como compra". Salva imediatamente ao
 * alternar (sem botão separado) — desfaz o estado visual se o servidor
 * recusar. Global quando `landingPageId` é `null`; senão vira um override
 * específico da landing page.
 */
export function PurchaseCountingCard({
  landingPageId,
  initialValue,
  initialHasOverride,
}: PurchaseCountingCardProps) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await updatePurchaseRuleAction(landingPageId, next);
      if (!result.ok) {
        setValue(previous);
        toast.error(result.error ?? "Não foi possível salvar a configuração.");
        return;
      }
      toast.success("Configuração salva.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Como contar os pedidos gerados
        </CardTitle>
        <CardDescription>
          {landingPageId
            ? initialHasOverride
              ? "Regra específica desta landing page — sobrepõe a configuração global."
              : "Ainda herdando a configuração global. Altere aqui para definir uma regra própria desta página."
            : "Regra padrão, aplicada a toda landing page sem configuração própria."}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge variant={value ? "warning" : "success"}>
            {value ? "Ligado" : "Desligado"}
          </Badge>
          <Switch
            checked={value}
            disabled={pending}
            onCheckedChange={handleChange}
            aria-label="Enviar pedidos gerados já como compra na Meta"
          />
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-3 text-sm">
        <p>
          {value ? (
            <>
              <strong className="text-foreground">
                Enviar pedidos gerados já como compra na Meta:
              </strong>{" "}
              o pedido será enviado como Purchase no momento em que for
              criado, mesmo antes da confirmação do pagamento. O status
              interno do pedido continua pendente até a confirmação do
              gateway.
            </>
          ) : (
            <>
              <strong className="text-foreground">
                Contar como compra somente pagamentos aprovados
              </strong>{" "}
              (recomendado): o Purchase só é enviado quando o pagamento é
              realmente confirmado.
            </>
          )}
        </p>
        {value ? (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>
              Essa configuração conta pedidos gerados como Purchase antes da
              confirmação do pagamento. Isso pode aumentar a quantidade de
              compras exibidas no Gerenciador de Anúncios em relação às
              vendas realmente pagas.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
