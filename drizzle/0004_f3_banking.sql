CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bank" text,
	"account_number" text,
	"currency" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_currency_check" CHECK ("bank_accounts"."currency" in ('CUP','USD','BRL'))
);
--> statement-breakpoint
CREATE TABLE "bank_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"movement_date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reference" text,
	"dedup_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"matched_payment_id" uuid,
	"matched_supplier_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_movements_status_check" CHECK ("bank_movements"."status" in ('pending','matched','ignored')),
	CONSTRAINT "bank_movements_amount_check" CHECK ("bank_movements"."amount_cents" <> 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_org_idx" ON "bank_accounts" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_movements_dedup_idx" ON "bank_movements" USING btree ("bank_account_id","dedup_hash");--> statement-breakpoint
CREATE INDEX "bank_movements_org_account_idx" ON "bank_movements" USING btree ("org_id","bank_account_id","movement_date");