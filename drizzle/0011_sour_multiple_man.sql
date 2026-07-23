CREATE TABLE "statement_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"fecha" text,
	"fecha_iso" date,
	"mes" integer,
	"anio" integer,
	"referencia" text,
	"operacion" text,
	"importe" numeric(14, 2),
	"saldo" numeric(14, 2),
	"observacion" text,
	"client_name" text,
	"pan_origen" text,
	"tipo_transaccion" text,
	"telefono" text,
	"conciliado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statement_movements_operacion_check" CHECK ("statement_movements"."operacion" in ('CR','DB',''))
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"cuenta_interna" text,
	"cuenta_estandarizada" text,
	"titular" text,
	"fecha_inicio" text,
	"fecha_fin" text,
	"saldo_inicial" numeric(14, 2) DEFAULT '0' NOT NULL,
	"saldo_final" numeric(14, 2),
	"total_creditos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_debitos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"num_operaciones" integer DEFAULT 0 NOT NULL,
	"cuadrado" boolean DEFAULT true NOT NULL,
	"validacion_mensajes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statement_movements_stmt_idx" ON "statement_movements" USING btree ("statement_id","position");--> statement-breakpoint
CREATE INDEX "statement_movements_org_period_idx" ON "statement_movements" USING btree ("org_id","anio","mes");--> statement-breakpoint
CREATE INDEX "statement_movements_client_idx" ON "statement_movements" USING btree ("org_id","client_name");--> statement-breakpoint
CREATE INDEX "statements_org_idx" ON "statements" USING btree ("org_id","created_at");