ALTER TABLE "payments" DROP CONSTRAINT "payments_method_check";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "tax_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('cash','card','transfer','qr','mlc','usd','other'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_check" CHECK ("sales"."discount_cents" >= 0 and "sales"."tax_cents" >= 0);