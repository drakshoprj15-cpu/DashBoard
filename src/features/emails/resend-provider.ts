import { Resend, type WebhookEventPayload } from "resend";

export const MAX_EMAILS_PER_BATCH = 100;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

export interface SendEmailBatchResult {
  ok: boolean;
  externalIds?: string[];
  error?: string;
}

let resendClient: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export function isResendWebhookConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET,
  );
}

function providerError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message).trim();
    if (message) return message.slice(0, 500);
  }
  return "Falha desconhecida ao enviar e-mail.";
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      error:
        "Resend não configurado (faltam RESEND_API_KEY e RESEND_FROM_EMAIL).",
    };
  }

  try {
    const { data, error } = await getResend().emails.send(
      {
        from: process.env.RESEND_FROM_EMAIL!,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      },
      input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined,
    );

    if (error) return { ok: false, error: providerError(error) };
    return { ok: true, externalId: data?.id };
  } catch (error) {
    return { ok: false, error: providerError(error) };
  }
}

export async function sendEmailBatch(
  inputs: Omit<SendEmailInput, "idempotencyKey">[],
  idempotencyKey: string,
): Promise<SendEmailBatchResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      error:
        "Resend não configurado (faltam RESEND_API_KEY e RESEND_FROM_EMAIL).",
    };
  }
  if (inputs.length === 0 || inputs.length > MAX_EMAILS_PER_BATCH) {
    return {
      ok: false,
      error: `O lote deve ter entre 1 e ${MAX_EMAILS_PER_BATCH} e-mails.`,
    };
  }

  try {
    const { data, error } = await getResend().batch.send(
      inputs.map((input) => ({
        from: process.env.RESEND_FROM_EMAIL!,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      })),
      { idempotencyKey },
    );

    if (error) return { ok: false, error: providerError(error) };
    return { ok: true, externalIds: data?.data.map((item) => item.id) ?? [] };
  } catch (error) {
    return { ok: false, error: providerError(error) };
  }
}

export function verifyResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
): WebhookEventPayload {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("RESEND_WEBHOOK_SECRET não configurado.");

  return getResend().webhooks.verify({
    payload,
    headers,
    webhookSecret,
  });
}

/** Verifica a chave fazendo uma chamada real sem enviar e-mail. */
export async function testResendConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      message: "Faltam RESEND_API_KEY e/ou RESEND_FROM_EMAIL.",
    };
  }

  try {
    const { error } = await getResend().domains.list();
    if (error) return { ok: false, message: providerError(error) };
    return { ok: true, message: "Ligação ao Resend validada." };
  } catch (error) {
    return { ok: false, message: providerError(error) };
  }
}
