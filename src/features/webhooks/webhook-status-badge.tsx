import { Badge } from "@/components/ui/badge";

export function WebhookStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "success" : "muted"}>
      {isActive ? "Ativo" : "Pausado"}
    </Badge>
  );
}

export function DeliveryStatusBadge({ status }: { status: string }) {
  const variant =
    status === "success"
      ? "success"
      : status === "pending"
        ? "info"
        : status === "failed" || status === "dead_letter"
          ? "destructive"
          : "muted";

  const label =
    status === "success"
      ? "Sucesso"
      : status === "pending"
        ? "Pendente"
        : status === "failed"
          ? "Falhou"
          : status === "dead_letter"
            ? "Sem retorno"
            : status;

  return <Badge variant={variant}>{label}</Badge>;
}
