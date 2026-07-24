CREATE TABLE "assistant_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recommendation_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'PENDIENTE' NOT NULL,
	"notes" text,
	"user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_followups_status_check" CHECK ("assistant_followups"."status" in ('PENDIENTE','EN_PROGRESO','COMPLETADA','DESCARTADA'))
);
--> statement-breakpoint
CREATE TABLE "employee_day_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"orders_produced" integer DEFAULT 0 NOT NULL,
	"waste_produced" numeric(14, 3) DEFAULT '0' NOT NULL,
	"defects" integer DEFAULT 0 NOT NULL,
	"hours_worked" numeric(10, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_labor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"cost_hour_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_labor_hours_check" CHECK ("production_labor"."hours" > 0),
	CONSTRAINT "production_labor_cost_check" CHECK ("production_labor"."cost_hour_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assistant_followups" ADD CONSTRAINT "assistant_followups_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_followups" ADD CONSTRAINT "assistant_followups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_day_evaluations" ADD CONSTRAINT "employee_day_evaluations_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_day_evaluations" ADD CONSTRAINT "employee_day_evaluations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_labor" ADD CONSTRAINT "production_labor_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_labor" ADD CONSTRAINT "production_labor_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_labor" ADD CONSTRAINT "production_labor_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_followups_unique_idx" ON "assistant_followups" USING btree ("org_id","recommendation_id");--> statement-breakpoint
CREATE INDEX "assistant_followups_status_idx" ON "assistant_followups" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "assistant_followups_category_idx" ON "assistant_followups" USING btree ("org_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_day_evaluations_unique_idx" ON "employee_day_evaluations" USING btree ("org_id","employee_id","date");--> statement-breakpoint
CREATE INDEX "employee_day_evaluations_date_idx" ON "employee_day_evaluations" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "production_labor_order_idx" ON "production_labor" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "production_labor_org_emp_idx" ON "production_labor" USING btree ("org_id","employee_id");