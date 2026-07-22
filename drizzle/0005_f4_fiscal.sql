CREATE TABLE "tax_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"concept_code" text NOT NULL,
	"name" text NOT NULL,
	"base_cents" bigint DEFAULT 0 NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_obligations_status_check" CHECK ("tax_obligations"."status" in ('pending','paid')),
	CONSTRAINT "tax_obligations_month_check" CHECK ("tax_obligations"."month" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_obligations_scope_idx" ON "tax_obligations" USING btree ("org_id","year","month","concept_code");