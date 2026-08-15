CREATE TABLE "payment_link_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payment_link_id" uuid NOT NULL,
	"order_id" uuid,
	"type" text NOT NULL,
	"method" text,
	"value_cents" bigint,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "payment_links_ws_slug_idx";--> statement-breakpoint
ALTER TABLE "payment_links" ALTER COLUMN "currency" SET DEFAULT 'EUR';--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "product_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "request_name" text DEFAULT 'required' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "request_email" text DEFAULT 'required' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "request_phone" text DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "request_shipping" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "shipping_options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "button_color" text DEFAULT '#E5097F' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "button_text_color" text DEFAULT '#FFFFFF' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "border_color" text DEFAULT '#E5E7EB' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "background_style" text DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "border_radius" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "button_text" text DEFAULT 'Pagar' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "domain_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "meta_pixel_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "max_payments" integer;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_link_events" ADD CONSTRAINT "payment_link_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_link_events" ADD CONSTRAINT "payment_link_events_payment_link_id_payment_links_id_fk" FOREIGN KEY ("payment_link_id") REFERENCES "public"."payment_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_link_events_link_idx" ON "payment_link_events" USING btree ("payment_link_id","type");--> statement-breakpoint
CREATE INDEX "payment_link_events_ws_created_idx" ON "payment_link_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_link_events_order_idx" ON "payment_link_events" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_links_slug_idx" ON "payment_links" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "payment_links_ws_active_idx" ON "payment_links" USING btree ("workspace_id","is_active");--> statement-breakpoint
CREATE INDEX "payment_links_domain_idx" ON "payment_links" USING btree ("domain_id");--> statement-breakpoint
-- Mesma postura de 0001_enable_rls.sql: RLS ligado em toda tabela nova. Todo
-- acesso a dados passa pelo servidor (Drizzle), nunca pelo navegador.
ALTER TABLE "payment_link_events" ENABLE ROW LEVEL SECURITY;
