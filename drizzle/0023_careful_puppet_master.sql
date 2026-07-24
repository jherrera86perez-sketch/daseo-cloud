CREATE TABLE "production_overhead_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "production_overhead_items_amount_check" CHECK ("production_overhead_items"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "production_overhead_items" ADD CONSTRAINT "production_overhead_items_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_overhead_items" ADD CONSTRAINT "production_overhead_items_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_overhead_items_order_idx" ON "production_overhead_items" USING btree ("order_id");