ALTER TABLE "payment_link_events" ADD COLUMN "visitor_key" text;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "status" "publish_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "brand_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "appearance_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "customer_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "success_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "seo_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "published_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payment_links"
SET
  "status" = CASE
    WHEN "archived_at" IS NOT NULL THEN 'archived'::"publish_status"
    WHEN "is_active" THEN 'published'::"publish_status"
    ELSE 'unpublished'::"publish_status"
  END,
  "payment_methods" = CASE
    WHEN jsonb_array_length("payment_methods") = 0 THEN '["mbway","multibanco"]'::jsonb
    ELSE "payment_methods"
  END,
  "brand_config" = jsonb_build_object(
    'companyName', '', 'logoSubtitle', '', 'faviconUrl', '',
    'logoAlignment', 'center', 'logoWidth', 180, 'logoHeight', 64, 'logoSpacing', 24
  ),
  "appearance_config" = jsonb_build_object(
    'backgroundType', 'solid',
    'backgroundColor', CASE WHEN "background_style" = 'dark' THEN '#0B0B0F' ELSE '#F6F7F9' END,
    'gradientFrom', '#F6F7F9', 'gradientTo', '#EEEAF5', 'gradientAngle', 135,
    'cardColor', CASE WHEN "background_style" = 'dark' THEN '#15151C' ELSE '#FFFFFF' END,
    'cardWidth', 460, 'cardRadius', "border_radius", 'cardBorderWidth', 1,
    'cardBorderColor', "border_color", 'cardShadow', 'soft', 'cardPadding', 28,
    'titleColor', CASE WHEN "background_style" = 'dark' THEN '#F4F4F5' ELSE '#18181B' END,
    'textColor', CASE WHEN "background_style" = 'dark' THEN '#A1A1AA' ELSE '#71717A' END,
    'titleSize', 22, 'titleWeight', '700',
    'inputBackgroundColor', CASE WHEN "background_style" = 'dark' THEN '#1C1C25' ELSE '#FFFFFF' END,
    'inputTextColor', CASE WHEN "background_style" = 'dark' THEN '#F4F4F5' ELSE '#18181B' END,
    'inputBorderColor', "border_color", 'inputRadius', GREATEST(0, "border_radius" - 4),
    'inputFocusColor', "button_color", 'inputPlaceholderColor', '#A1A1AA',
    'buttonColor', "button_color", 'buttonHoverColor', "button_color",
    'buttonTextColor', "button_text_color", 'buttonRadius', GREATEST(0, "border_radius" - 4),
    'buttonHeight', 52, 'buttonFontSize', 15, 'buttonWeight', '700',
    'secondaryButtonText', 'Voltar aos dados', 'secondaryButtonColor', '#18181B',
    'secondaryButtonBackground', '#FFFFFF', 'secondaryButtonBorderColor', "border_color",
    'securityText', 'Pagamento seguro'
  ),
  "customer_fields" = jsonb_build_array(
    jsonb_build_object('key','firstName','mode',"request_name",'order',0),
    jsonb_build_object('key','lastName','mode','optional','order',1),
    jsonb_build_object('key','email','mode',"request_email",'order',2),
    jsonb_build_object('key','phone','mode',"request_phone",'order',3),
    jsonb_build_object('key','document','mode','hidden','order',4),
    jsonb_build_object('key','addressLine1','mode',CASE WHEN "requires_address" THEN 'required' ELSE 'hidden' END,'order',5),
    jsonb_build_object('key','addressLine2','mode',CASE WHEN "requires_address" THEN 'optional' ELSE 'hidden' END,'order',6),
    jsonb_build_object('key','postalCode','mode',CASE WHEN "requires_address" THEN 'required' ELSE 'hidden' END,'order',7),
    jsonb_build_object('key','city','mode',CASE WHEN "requires_address" THEN 'required' ELSE 'hidden' END,'order',8),
    jsonb_build_object('key','region','mode',CASE WHEN "requires_address" THEN 'optional' ELSE 'hidden' END,'order',9),
    jsonb_build_object('key','country','mode',CASE WHEN "requires_address" THEN 'required' ELSE 'hidden' END,'order',10)
  ),
  "success_config" = jsonb_build_object(
    'title','Pagamento confirmado','description','Recebemos o seu pagamento.',
    'buttonText','Continuar','redirectUrl',COALESCE("success_url",'')
  ),
  "seo_config" = jsonb_build_object('browserTitle',"title",'description',COALESCE("description",''),'faviconUrl',''),
  "published_at" = CASE WHEN "is_active" AND "archived_at" IS NULL THEN "created_at" ELSE NULL END;--> statement-breakpoint
UPDATE "payment_links"
SET "published_snapshot" = jsonb_build_object(
  'slug', "slug", 'title', "title", 'description', "description",
  'amountCents', "price_cents", 'currency', "currency", 'product', "product_snapshot",
  'paymentMethods', "payment_methods",
  'brand', "brand_config" || jsonb_build_object('logoUrl', "logo_url"),
  'appearance', "appearance_config" || jsonb_build_object(
    'backgroundStyle', "background_style", 'borderColor', "border_color",
    'borderRadius', "border_radius", 'buttonText', "button_text"
  ),
  'fields', jsonb_build_object(
    'requestName', "request_name", 'requestEmail', "request_email", 'requestPhone', "request_phone",
    'requiresAddress', "requires_address", 'requestShipping', "request_shipping",
    'shippingOptions', "shipping_options", 'customerFields', "customer_fields"
  ),
  'success', "success_config", 'seo', "seo_config"
)
WHERE "status" = 'published'::"publish_status";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_link_id_payment_links_id_fk" FOREIGN KEY ("payment_link_id") REFERENCES "public"."payment_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_link_events_visitor_type_idx" ON "payment_link_events" USING btree ("payment_link_id","type","visitor_key");--> statement-breakpoint
CREATE INDEX "payment_links_ws_status_idx" ON "payment_links" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_payment_type_idx" ON "ledger_entries" USING btree ("payment_id","type");--> statement-breakpoint
ALTER TABLE "payment_links" ENABLE ROW LEVEL SECURITY;
