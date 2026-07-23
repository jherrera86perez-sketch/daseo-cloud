CREATE TABLE "employee_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"notes" text,
	"evaluated_at" date DEFAULT current_date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_evaluations_score_check" CHECK ("employee_evaluations"."score" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "employee_evaluations" ADD CONSTRAINT "employee_evaluations_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_evaluations" ADD CONSTRAINT "employee_evaluations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_evaluations_org_idx" ON "employee_evaluations" USING btree ("org_id","employee_id");