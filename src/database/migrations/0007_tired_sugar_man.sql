ALTER TABLE "domains" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;