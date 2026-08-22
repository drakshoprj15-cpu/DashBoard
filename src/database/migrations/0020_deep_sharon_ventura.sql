ALTER TABLE "landing_pages" ADD COLUMN "hosting_provider" text DEFAULT 'infinity' NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "deployment_url" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "deployment_project_id" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "deployment_id" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "deployment_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "deployment_log" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "deployment_updated_at" timestamp with time zone;