export type EmailSuppressionReason = "bounce" | "complaint" | "provider" | null;

function bounceType(data: Record<string, unknown>): string | null {
  const bounce = data.bounce;
  if (!bounce || typeof bounce !== "object") return null;
  const type = (bounce as Record<string, unknown>).type;
  return typeof type === "string" ? type.trim().toLowerCase() : null;
}

/**
 * Bounces temporários podem voltar a entregar e não devem entrar na lista
 * local permanente. O próprio Resend continua responsável por impedir um
 * envio quando o endereço estiver suprimido no provedor.
 */
export function suppressionReasonForResendEvent(
  eventType: string,
  data: Record<string, unknown>,
): EmailSuppressionReason {
  if (eventType === "email.complained") return "complaint";
  if (eventType === "email.suppressed") return "provider";
  if (eventType === "email.bounced" && bounceType(data) === "permanent") {
    return "bounce";
  }
  return null;
}
