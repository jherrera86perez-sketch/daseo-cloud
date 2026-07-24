CREATE TABLE "internal_outflow_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"outflow_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text,
	"qty" numeric(14, 3) NOT NULL,
	"unit" text,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"total_cost_cents" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "internal_outflow_items_qty_check" CHECK ("internal_outflow_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "internal_outflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tipo" text NOT NULL,
	"destino_nombre" text,
	"employee_id" uuid,
	"monto_efectivo_cents" bigint DEFAULT 0 NOT NULL,
	"valor_productos_cents" bigint DEFAULT 0 NOT NULL,
	"bank_account_id" uuid,
	"bank_movement_id" uuid,
	"motivo" text,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_outflows_tipo_check" CHECK ("internal_outflows"."tipo" in ('DONACION','REGALO','AUTOCONSUMO','TRABAJADORES')),
	CONSTRAINT "internal_outflows_efectivo_check" CHECK ("internal_outflows"."monto_efectivo_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "internal_outflow_items" ADD CONSTRAINT "internal_outflow_items_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_outflow_items" ADD CONSTRAINT "internal_outflow_items_outflow_id_internal_outflows_id_fk" FOREIGN KEY ("outflow_id") REFERENCES "public"."internal_outflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_outflow_items" ADD CONSTRAINT "internal_outflow_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_outflows" ADD CONSTRAINT "internal_outflows_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_outflows" ADD CONSTRAINT "internal_outflows_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_outflows" ADD CONSTRAINT "internal_outflows_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internal_outflow_items_outflow_idx" ON "internal_outflow_items" USING btree ("outflow_id");--> statement-breakpoint
CREATE INDEX "internal_outflows_org_fecha_idx" ON "internal_outflows" USING btree ("org_id","fecha");--> statement-breakpoint
CREATE INDEX "internal_outflows_org_tipo_idx" ON "internal_outflows" USING btree ("org_id","tipo");