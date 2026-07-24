CREATE TABLE "consolidated_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"archivo_nombre" text,
	"fecha_contable" date NOT NULL,
	"dia" integer,
	"mes" integer,
	"anio" integer,
	"referencia" text,
	"tipo_transaccion" text NOT NULL,
	"importe" numeric(14, 2) DEFAULT '0' NOT NULL,
	"saldo" numeric(14, 2),
	"observaciones" text,
	"categoria" text,
	"subcategoria" text,
	"detalle" text,
	"conciliado" boolean DEFAULT false NOT NULL,
	"cliente_nombre" text,
	"telefono" text,
	"pan" text,
	"tipo_operacion" text,
	"statement_movement_id" uuid,
	"origen" text DEFAULT 'manual' NOT NULL,
	"audit_status" text DEFAULT 'PENDIENTE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consolidated_tipo_check" CHECK ("consolidated_entries"."tipo_transaccion" in ('CR','DB')),
	CONSTRAINT "consolidated_importe_check" CHECK ("consolidated_entries"."importe" >= 0),
	CONSTRAINT "consolidated_origen_check" CHECK ("consolidated_entries"."origen" in ('banco','manual','salida_interna')),
	CONSTRAINT "consolidated_audit_check" CHECK ("consolidated_entries"."audit_status" in ('PENDIENTE','CONCILIADO','MANUAL'))
);
--> statement-breakpoint
ALTER TABLE "internal_outflows" DROP CONSTRAINT "internal_outflows_bank_account_id_bank_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "referencia_bancaria" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "banco_movimiento_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "banco_match_score" integer;--> statement-breakpoint
ALTER TABLE "statement_movements" ADD COLUMN "consolidado_id" uuid;--> statement-breakpoint
ALTER TABLE "consolidated_entries" ADD CONSTRAINT "consolidated_entries_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consolidated_org_anio_mes_idx" ON "consolidated_entries" USING btree ("org_id","anio","mes");--> statement-breakpoint
CREATE INDEX "consolidated_org_categoria_idx" ON "consolidated_entries" USING btree ("org_id","categoria");--> statement-breakpoint
CREATE INDEX "consolidated_org_subcategoria_idx" ON "consolidated_entries" USING btree ("org_id","subcategoria");--> statement-breakpoint
CREATE INDEX "consolidated_movimiento_idx" ON "consolidated_entries" USING btree ("statement_movement_id");--> statement-breakpoint
CREATE INDEX "consolidated_org_cliente_idx" ON "consolidated_entries" USING btree ("org_id","cliente_nombre");--> statement-breakpoint
ALTER TABLE "internal_outflows" DROP COLUMN "bank_account_id";--> statement-breakpoint
ALTER TABLE "internal_outflows" DROP COLUMN "bank_movement_id";