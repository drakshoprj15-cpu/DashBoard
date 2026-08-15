UPDATE "customers"
SET
  "email" = lower(trim("email")),
  "normalized_email" = lower(trim("email")),
  "updated_at" = now()
WHERE "normalized_email" IS NULL
  AND lower(trim("email")) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';--> statement-breakpoint
DROP INDEX "customers_normalized_email_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "customers_ws_normalized_email_idx" ON "customers" USING btree ("workspace_id","normalized_email");
