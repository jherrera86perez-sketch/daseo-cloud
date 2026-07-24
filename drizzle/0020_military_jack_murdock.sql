ALTER TABLE "supplier_payments" DROP CONSTRAINT "supplier_payments_method_check";--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "transport_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "allowance_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "other_costs_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "supplier_invoice" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_account" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_extras_check" CHECK ("purchases"."transport_cents" >= 0 and "purchases"."allowance_cents" >= 0 and "purchases"."other_costs_cents" >= 0);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_method_check" CHECK ("supplier_payments"."method" in ('cash','card','transfer','qr','cheque','mlc','usd','other'));