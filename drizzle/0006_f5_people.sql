CREATE TABLE "customer_commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"description" text NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"active" text DEFAULT 'yes' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_commitments_frequency_check" CHECK ("customer_commitments"."frequency" in ('weekly','monthly')),
	CONSTRAINT "customer_commitments_active_check" CHECK ("customer_commitments"."active" in ('yes','no'))
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"salary_cents" bigint DEFAULT 0 NOT NULL,
	"hired_at" date,
	"active" text DEFAULT 'yes' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_salary_check" CHECK ("employees"."salary_cents" >= 0),
	CONSTRAINT "employees_active_check" CHECK ("employees"."active" in ('yes','no'))
);
--> statement-breakpoint
ALTER TABLE "customer_commitments" ADD CONSTRAINT "customer_commitments_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_commitments" ADD CONSTRAINT "customer_commitments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_commitments_org_idx" ON "customer_commitments" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "employees_org_idx" ON "employees" USING btree ("org_id","name");