ALTER TABLE "customers" ADD COLUMN "imported_product_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "imported_product_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_imported_product_id_products_id_fk" FOREIGN KEY ("imported_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_imported_product_idx" ON "customers" USING btree ("workspace_id","imported_product_id");