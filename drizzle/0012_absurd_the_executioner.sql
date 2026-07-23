CREATE TABLE "raffles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"mes" integer NOT NULL,
	"anio" integer NOT NULL,
	"num_participantes" integer DEFAULT 0 NOT NULL,
	"ganador_client_name" text NOT NULL,
	"ganador_pan" text,
	"ganador_telefono" text,
	"ganador_num_ops" integer DEFAULT 0 NOT NULL,
	"ganador_total_creditos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fecha_sorteo" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raffles" ADD CONSTRAINT "raffles_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raffles_org_idx" ON "raffles" USING btree ("org_id","fecha_sorteo");