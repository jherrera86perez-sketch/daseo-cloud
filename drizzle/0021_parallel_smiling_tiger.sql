ALTER TABLE "products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_min_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lead_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "safety_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_min_calculated" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_min_calculated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_check" CHECK ("products"."category" is null or "products"."category" in ('insumo','semi_elaborado','producto_final','servicio'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_min_mode_check" CHECK ("products"."stock_min_mode" in ('manual','auto'));