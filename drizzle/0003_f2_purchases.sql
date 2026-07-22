CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expiry_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid,
	"lot_id" uuid,
	"description" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"unit_cost_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	CONSTRAINT "purchase_items_qty_check" CHECK ("purchase_items"."qty" > 0),
	CONSTRAINT "purchase_items_cost_check" CHECK ("purchase_items"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"series" text DEFAULT 'A' NOT NULL,
	"year" integer NOT NULL,
	"number" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"rate_to_base_fixed" numeric(18, 6) NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"total_base_cents" bigint DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone,
	"due_date" timestamp with time zone,
	"idempotency_key" uuid,
	"fiscal_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_status_check" CHECK ("purchases"."status" in ('draft','confirmed','cancelled')),
	CONSTRAINT "purchases_totals_check" CHECK ("purchases"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"rate_fixed" numeric(18, 6) NOT NULL,
	"applied_cents" bigint NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_amount_check" CHECK ("supplier_payments"."amount_cents" > 0),
	CONSTRAINT "supplier_payments_applied_check" CHECK ("supplier_payments"."applied_cents" > 0),
	CONSTRAINT "supplier_payments_method_check" CHECK ("supplier_payments"."method" in ('cash','transfer','other'))
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"email" text,
	"phone" text,
	"address" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "lot_id" uuid;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lots_org_product_code_idx" ON "lots" USING btree ("org_id","product_id","code");--> statement-breakpoint
CREATE INDEX "lots_org_expiry_idx" ON "lots" USING btree ("org_id","expiry_date");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_number_idx" ON "purchases" USING btree ("org_id","series","year","number") WHERE "purchases"."number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_idempotency_idx" ON "purchases" USING btree ("org_id","idempotency_key") WHERE "purchases"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "purchases_org_supplier_idx" ON "purchases" USING btree ("org_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_org_purchase_idx" ON "supplier_payments" USING btree ("org_id","purchase_id");--> statement-breakpoint
CREATE INDEX "suppliers_org_idx" ON "suppliers" USING btree ("org_id","name");