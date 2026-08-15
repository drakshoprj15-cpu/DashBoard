CREATE TYPE "public"."integration_delivery_status" AS ENUM('pending', 'processing', 'success', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TABLE "integration_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sale_status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "integration_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_token" text,
	"http_status" integer,
	"error_code" text,
	"error_message" text,
	"duration_ms" integer,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"result" text NOT NULL,
	"http_status" integer,
	"error_code" text,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "last_utm" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_utm" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "chargeback_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD COLUMN "last_utm" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "connection_status" text DEFAULT 'not_tested' NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_connection_test_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_connection_ok" boolean;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_connection_http_status" integer;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_connection_message" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_connection_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_delivery_attempts" ADD CONSTRAINT "integration_delivery_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_delivery_attempts" ADD CONSTRAINT "integration_delivery_attempts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_delivery_attempts" ADD CONSTRAINT "integration_delivery_attempts_delivery_id_integration_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."integration_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_deliveries_order_status_idx" ON "integration_deliveries" USING btree ("workspace_id","integration_id","order_id","sale_status");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_deliveries_idempotency_idx" ON "integration_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "integration_deliveries_queue_idx" ON "integration_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "integration_deliveries_workspace_idx" ON "integration_deliveries" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "integration_delivery_attempts_delivery_idx" ON "integration_delivery_attempts" USING btree ("delivery_id","attempt_number");--> statement-breakpoint
CREATE INDEX "integration_delivery_attempts_workspace_idx" ON "integration_delivery_attempts" USING btree ("workspace_id","created_at");
--> statement-breakpoint
UPDATE "carts" SET "last_utm" = "utm" WHERE "utm" <> '{}'::jsonb;
--> statement-breakpoint
UPDATE "orders" SET "last_utm" = "utm" WHERE "utm" <> '{}'::jsonb;
--> statement-breakpoint
UPDATE "visitor_sessions" SET "last_utm" = "utm" WHERE "utm" <> '{}'::jsonb;
--> statement-breakpoint
UPDATE "integrations" SET "is_active" = true WHERE "status" = 'connected';
--> statement-breakpoint
INSERT INTO "integrations" (
	"workspace_id", "key", "name", "category", "status", "environment",
	"encrypted_credentials", "config", "is_active", "connection_status",
	"last_connection_test_at", "last_connection_ok", "last_connection_message",
	"last_event_at", "created_at", "updated_at"
)
SELECT
	p."workspace_id", 'utmify', p."name", 'analytics',
	CASE WHEN p."is_active" THEN 'connected'::integration_status ELSE 'disabled'::integration_status END,
	p."environment", p."encrypted_token",
	jsonb_build_object(
		'credentialName', coalesce(nullif(p."pixel_id", ''), 'Credencial migrada'),
		'platform', 'Infinity',
		'tokenPreview', coalesce(p."token_preview", '••••••')
	),
	p."is_active", CASE WHEN p."connection_status" = 'valid' THEN 'valid' ELSE 'not_tested' END,
	p."last_tested_at", CASE WHEN p."connection_status" = 'valid' THEN true ELSE null END,
	p."last_test_error", p."last_activity_at", p."created_at", p."updated_at"
FROM "pixels" p
WHERE p."type" = 'utmify' AND p."deleted_at" IS NULL AND p."encrypted_token" IS NOT NULL
ON CONFLICT ("workspace_id", "key") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "integration_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_delivery_attempts" ENABLE ROW LEVEL SECURITY;
