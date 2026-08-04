-- Central de recuperação de carrinhos: link de retomada do checkout,
-- contagem/canal de lembretes, marcação manual de recuperação,
-- arquivamento, rastreio do lote de importação e o histórico `cart_events`.
--
-- Aditiva por natureza (só ADD COLUMN, CREATE TABLE e CREATE INDEX): nenhuma
-- coluna existente é removida ou renomeada, então a aplicação em execução
-- continua funcionando durante a aplicação.
--
-- Nota deliberada sobre `recovered_manually_at`: receita em todo o painel é
-- calculada por `orders.status in ('paid','shipped','delivered')` e esse
-- status só é gravado pela confirmação real do gateway (webhook). "Marcar
-- como convertido" no painel grava esta coluna separada — aparece como
-- recuperado em Carrinhos e permanece invisível para Dashboard, Financeiro,
-- Produtos e Clientes. Por isso o enum `order_status` não é alterado aqui.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "checkout_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "last_reminder_channel" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "recovered_manually_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "import_batch_id" uuid;--> statement-breakpoint

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_reminder_count_non_negative";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_reminder_count_non_negative" CHECK ("reminder_count" >= 0);--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_last_reminder_channel_known";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_last_reminder_channel_known" CHECK ("last_reminder_channel" IS NULL OR "last_reminder_channel" IN ('email','whatsapp'));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_archived_idx" ON "orders" USING btree ("workspace_id","archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_import_batch_idx" ON "orders" USING btree ("import_batch_id");--> statement-breakpoint

-- Histórico de recuperação ----------------------------------------------------

CREATE TABLE IF NOT EXISTS "cart_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"channel" text,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_events" ADD CONSTRAINT "cart_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_events" ADD CONSTRAINT "cart_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_events" DROP CONSTRAINT IF EXISTS "cart_events_type_known";--> statement-breakpoint
ALTER TABLE "cart_events" ADD CONSTRAINT "cart_events_type_known" CHECK ("type" IN ('created','status_changed','email_sent','whatsapp_opened','imported','exported','archived','reminder_failed'));--> statement-breakpoint
ALTER TABLE "cart_events" DROP CONSTRAINT IF EXISTS "cart_events_channel_known";--> statement-breakpoint
ALTER TABLE "cart_events" ADD CONSTRAINT "cart_events_channel_known" CHECK ("channel" IS NULL OR "channel" IN ('email','whatsapp'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cart_events_order_idx" ON "cart_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cart_events_workspace_idx" ON "cart_events" USING btree ("workspace_id","type");--> statement-breakpoint

-- Mesma postura de segurança de 0001_enable_rls.sql: RLS ativo em toda tabela
-- nova. A aplicação continua funcionando (conecta como `postgres`, que ignora
-- RLS); isto bloqueia leitura direta via anon key — e `cart_events` guarda
-- referências a pedidos e clientes reais.
ALTER TABLE "cart_events" ENABLE ROW LEVEL SECURITY;
