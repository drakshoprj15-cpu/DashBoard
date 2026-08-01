CREATE TABLE "product_custom_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"meta_pixel_id" text,
	"meta_pixel_enabled" boolean DEFAULT false NOT NULL,
	"custom_head_code" text,
	"custom_body_start_code" text,
	"custom_body_end_code" text,
	"custom_css" text,
	"custom_javascript" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_custom_code" ADD CONSTRAINT "product_custom_code_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_custom_code" ADD CONSTRAINT "product_custom_code_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_custom_code_product_idx" ON "product_custom_code" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_custom_code_workspace_idx" ON "product_custom_code" USING btree ("workspace_id");--> statement-breakpoint
-- Mesma postura de segurança de 0001_enable_rls.sql: RLS ativo em toda
-- tabela nova. A aplicação continua funcionando normalmente (conecta como
-- `postgres`, que ignora RLS); isto só bloqueia leitura direta via anon key.
ALTER TABLE "product_custom_code" ENABLE ROW LEVEL SECURITY;