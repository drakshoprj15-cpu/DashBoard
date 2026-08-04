CREATE INDEX "customers_created_idx" ON "customers" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_first_landing_idx" ON "customers" USING btree ("workspace_id","first_landing_page_id");--> statement-breakpoint
CREATE INDEX "customers_last_landing_idx" ON "customers" USING btree ("workspace_id","last_landing_page_id");--> statement-breakpoint
CREATE INDEX "cart_items_product_idx" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "carts_customer_idx" ON "carts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_campaign_idx" ON "orders" USING btree ("workspace_id","campaign_id");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "customers_document_idx" ON "customers" USING btree ("workspace_id","document");
--> statement-breakpoint
CREATE INDEX "customers_name_search_idx" ON "customers" USING gin ((lower(coalesce("first_name", '') || ' ' || coalesce("last_name", ''))) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "customers_email_search_idx" ON "customers" USING gin ((lower("email")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "customers_phone_search_idx" ON "customers" USING gin ("normalized_phone" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "orders_reference_search_idx" ON "orders" USING gin ("reference" gin_trgm_ops);
