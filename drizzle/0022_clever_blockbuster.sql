ALTER TABLE "customers" ADD COLUMN "customer_type" text DEFAULT 'CLIENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "commercial_type" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "credit_days" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "credit_limit_cents" bigint;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "discount_default_pct" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "block_reason" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_type_check" CHECK ("customers"."customer_type" in ('CLIENTE','PDV'));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_credit_limit_check" CHECK ("customers"."credit_limit_cents" is null or "customers"."credit_limit_cents" >= 0);