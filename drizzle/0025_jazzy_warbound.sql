CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"brand" text,
	"model" text,
	"category_code" text NOT NULL,
	"acquisition_date" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_category_check" CHECK ("vehicles"."category_code" in ('A_MOTO','A_LIGERO','A_PANEL','B_CARGA_LIGERA','B_CARGA_MEDIA')),
	CONSTRAINT "vehicles_status_check" CHECK ("vehicles"."status" in ('ACTIVE','SOLD','JUNK'))
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_org_plate_idx" ON "vehicles" USING btree ("org_id","plate");--> statement-breakpoint
CREATE INDEX "vehicles_org_idx" ON "vehicles" USING btree ("org_id","status");