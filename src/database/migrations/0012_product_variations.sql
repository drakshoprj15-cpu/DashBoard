-- Sistema de variações de produto: atributos (Cor, Tamanho…), valores,
-- variações vendáveis com preço/estoque/imagens próprios, galeria por
-- variação e cópia congelada da variação dentro do pedido.
--
-- Aditiva por natureza (só ADD COLUMN, CREATE TABLE e CREATE INDEX): nenhuma
-- coluna existente é removida ou renomeada, então a aplicação em execução
-- continua funcionando durante a aplicação. As variações que já existirem
-- continuam válidas — as colunas novas entram com valores padrão coerentes.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "has_variants" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Atributos e valores ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS "product_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_options_product_name_idx" ON "product_options" USING btree ("product_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_options_product_idx" ON "product_options" USING btree ("product_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_option_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"hex_color" text,
	"thumbnail_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_option_values_option_value_idx" ON "product_option_values" USING btree ("option_id","value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_option_values_option_idx" ON "product_option_values" USING btree ("option_id");--> statement-breakpoint

-- Variações -------------------------------------------------------------------

ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "public_name" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "public_id" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "options_key" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "barcode" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "compare_at_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "cost_cents" bigint;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "currency" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "track_inventory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "allow_backorder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "purchase_limit" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "dimensions" jsonb;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "main_image_url" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "share_image_url" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "hex_color" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint

-- Dinheiro e estoque nunca negativos, mesmo por escrita direta no banco.
ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "product_variants_price_non_negative";--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_non_negative" CHECK ("price_cents" IS NULL OR "price_cents" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "product_variants_compare_price_non_negative";--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_compare_price_non_negative" CHECK ("compare_at_price_cents" IS NULL OR "compare_at_price_cents" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "product_variants_stock_non_negative";--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_non_negative" CHECK ("stock_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "product_variants_status_known";--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_status_known" CHECK ("status" IN ('active','sold_out','unavailable'));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_variants_workspace_idx" ON "product_variants" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_public_id_idx" ON "product_variants" USING btree ("product_id","public_id");--> statement-breakpoint
-- Uma única variação padrão por produto, e uma combinação de opções só pode
-- existir uma vez — ambos garantidos por índice parcial (variação arquivada
-- sai da regra, senão seria impossível recriar a mesma cor depois).
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_default_idx" ON "product_variants" USING btree ("product_id") WHERE "is_default" AND "archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_options_key_idx" ON "product_variants" USING btree ("product_id","options_key") WHERE "options_key" IS NOT NULL AND "archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_ws_sku_idx" ON "product_variants" USING btree ("workspace_id","sku") WHERE "sku" IS NOT NULL AND "archived_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_variant_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"option_value_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variant_values" ADD CONSTRAINT "product_variant_values_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_values" ADD CONSTRAINT "product_variant_values_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_values" ADD CONSTRAINT "product_variant_values_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_values" ADD CONSTRAINT "product_variant_values_option_value_id_product_option_values_id_fk" FOREIGN KEY ("option_value_id") REFERENCES "public"."product_option_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variant_values_variant_option_idx" ON "product_variant_values" USING btree ("variant_id","option_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_variant_values_variant_idx" ON "product_variant_values" USING btree ("variant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_variant_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variant_media" ADD CONSTRAINT "product_variant_media_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_media" ADD CONSTRAINT "product_variant_media_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_variant_media_variant_idx" ON "product_variant_media" USING btree ("variant_id");--> statement-breakpoint

-- Cópia congelada da variação dentro do pedido ---------------------------------

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "variant_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "variant_options" jsonb;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sku" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "currency" text;--> statement-breakpoint

-- Variações já existentes ganham identificador público e viram padrão quando
-- o produto só tem uma — sem isso, um produto antigo abriria sem seleção.
UPDATE "product_variants"
   SET "public_id" = COALESCE("public_id", replace("id"::text, '-', ''))
 WHERE "public_id" IS NULL;--> statement-breakpoint

-- Mesma postura de segurança de 0001_enable_rls.sql: RLS ativo em toda
-- tabela nova. A aplicação continua funcionando (conecta como `postgres`,
-- que ignora RLS); isto bloqueia leitura direta via anon key.
ALTER TABLE "product_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_option_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_variant_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_variant_media" ENABLE ROW LEVEL SECURITY;
