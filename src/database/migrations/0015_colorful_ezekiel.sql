CREATE TABLE "customer_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text,
	"reference_type" text,
	"reference_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'dynamic' NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estimated_count" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_tag_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'pink' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "normalized_email" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email_status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "normalized_phone" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "phone_country_code" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "source" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "first_source" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "first_landing_page_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_landing_page_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "accepts_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "accepts_sms" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "accepts_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- Preserva a leitura dos registros existentes e prepara busca/deduplicação.
UPDATE "customers"
SET
	"normalized_email" = NULLIF(lower(trim("email")), ''),
	"normalized_phone" = NULLIF(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), ''),
	"first_seen_at" = "created_at",
	"last_activity_at" = greatest("created_at", coalesce("last_purchase_at", "created_at"));--> statement-breakpoint

ALTER TABLE "customers" ADD CONSTRAINT "customers_email_status_known" CHECK ("email_status" IN ('unknown','valid','invalid','bounced','complained','unavailable'));--> statement-breakpoint
ALTER TABLE "customer_segments" ADD CONSTRAINT "customer_segments_type_known" CHECK ("type" IN ('dynamic','static'));--> statement-breakpoint
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_segments" ADD CONSTRAINT "customer_segments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_tag_id_customer_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."customer_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_activities_customer_idx" ON "customer_activities" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_activities_workspace_idx" ON "customer_activities" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "customer_notes_customer_idx" ON "customer_notes" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_notes_workspace_idx" ON "customer_notes" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_segments_ws_name_idx" ON "customer_segments" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "customer_segments_workspace_idx" ON "customer_segments" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_tag_assignments_unique_idx" ON "customer_tag_assignments" USING btree ("customer_id","tag_id");--> statement-breakpoint
CREATE INDEX "customer_tag_assignments_customer_idx" ON "customer_tag_assignments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_tag_assignments_tag_idx" ON "customer_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_tags_ws_name_idx" ON "customer_tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "customer_tags_workspace_idx" ON "customer_tags" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "customers_normalized_email_idx" ON "customers" USING btree ("workspace_id","normalized_email");--> statement-breakpoint
CREATE INDEX "customers_normalized_phone_idx" ON "customers" USING btree ("workspace_id","normalized_phone");--> statement-breakpoint
CREATE INDEX "customers_last_activity_idx" ON "customers" USING btree ("workspace_id","last_activity_at");--> statement-breakpoint

-- Postura deny-by-default do projeto: essas tabelas armazenam PII e não são
-- expostas diretamente pela anon key. O servidor acessa por Drizzle.
ALTER TABLE "customer_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_tag_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_tags" ENABLE ROW LEVEL SECURITY;
