-- Construtor de landing pages: rascunho versus versão publicada, tema,
-- rastreamento, código personalizado e métricas por página.
--
-- Aditiva por natureza (só ADD COLUMN e CREATE TABLE): nenhuma coluna ou
-- tabela existente é removida ou renomeada, então a aplicação em execução
-- continua funcionando durante a aplicação.

ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "public_name" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "theme" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "tracking" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "custom_code" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "product_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "product_sync" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "logo_url" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "favicon_url" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'pt-PT' NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "country" text DEFAULT 'PT' NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "published_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "published_version" integer;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "draft_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "published_by" uuid;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "scheduled_publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "preview_token" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint

ALTER TABLE "landing_page_versions" ADD COLUMN IF NOT EXISTS "note" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "landing_pages_status_idx" ON "landing_pages" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_page_versions_page_idx" ON "landing_page_versions" USING btree ("landing_page_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "landing_page_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"landing_page_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"anonymous_id" text NOT NULL,
	"value_cents" bigint,
	"currency" text,
	"device_type" text,
	"source" text,
	"campaign" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "landing_page_events" ADD CONSTRAINT "landing_page_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_events" ADD CONSTRAINT "landing_page_events_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_page_events_page_idx" ON "landing_page_events" USING btree ("landing_page_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_page_events_name_idx" ON "landing_page_events" USING btree ("landing_page_id","event_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_page_events_workspace_idx" ON "landing_page_events" USING btree ("workspace_id");--> statement-breakpoint

-- Mesma postura de segurança de 0001_enable_rls.sql: RLS ativo em toda
-- tabela nova. A aplicação continua funcionando (conecta como `postgres`,
-- que ignora RLS); isto bloqueia leitura direta via anon key.
ALTER TABLE "landing_page_events" ENABLE ROW LEVEL SECURITY;
