import { z } from "zod";

import { WEBHOOK_EVENT_KEYS } from "@/features/webhooks/events-catalog";

export const createWebhookEndpointSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao webhook"),
  url: z.string().trim().url("URL inválida"),
  events: z
    .array(z.enum(WEBHOOK_EVENT_KEYS))
    .min(1, "Escolha pelo menos um evento"),
  isActive: z.coerce.boolean().default(true),
});

export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export const updateWebhookEndpointSchema = createWebhookEndpointSchema.extend({
  id: z.string().uuid("Webhook inválido"),
});

export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;

export const sendTestWebhookSchema = z.object({
  id: z.string().uuid("Webhook inválido"),
  event: z.enum(WEBHOOK_EVENT_KEYS),
});

export type SendTestWebhookInput = z.infer<typeof sendTestWebhookSchema>;
