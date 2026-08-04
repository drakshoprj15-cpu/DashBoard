CREATE TYPE "public"."pixel_connection_status" AS ENUM('not_tested', 'connected', 'invalid_token', 'invalid_pixel', 'connection_error', 'disabled');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_fbp" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_fbc" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_ip" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_user_agent" text;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "landing_page_id" uuid;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "trigger_type" text;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "http_status" integer;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "meta_trace_id" text;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD COLUMN "payload_version" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "pixels" ADD COLUMN "landing_page_id" uuid;--> statement-breakpoint
ALTER TABLE "pixels" ADD COLUMN "token_preview" text;--> statement-breakpoint
ALTER TABLE "pixels" ADD COLUMN "test_event_code" text;--> statement-breakpoint
ALTER TABLE "pixels" ADD COLUMN "connection_status" "pixel_connection_status" DEFAULT 'not_tested' NOT NULL;--> statement-breakpoint
ALTER TABLE "pixels" ADD COLUMN "last_tested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pixels" ADD COLUMN "last_test_error" text;--> statement-breakpoint
ALTER TABLE "pixel_events" ADD CONSTRAINT "pixel_events_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixels" ADD CONSTRAINT "pixels_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pixel_events_workspace_created_idx" ON "pixel_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "pixel_events_lp_idx" ON "pixel_events" USING btree ("landing_page_id");--> statement-breakpoint
CREATE INDEX "pixel_events_order_idx" ON "pixel_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pixels_workspace_lp_idx" ON "pixels" USING btree ("workspace_id","landing_page_id");
