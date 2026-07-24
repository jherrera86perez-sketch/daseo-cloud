CREATE TABLE "telegram_birthday_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_birthday_log_status_check" CHECK ("telegram_birthday_log"."status" in ('sent','skipped'))
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "telegram_birthday_log" ADD CONSTRAINT "telegram_birthday_log_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_birthday_log" ADD CONSTRAINT "telegram_birthday_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_birthday_log_customer_year_idx" ON "telegram_birthday_log" USING btree ("customer_id","year");--> statement-breakpoint
CREATE INDEX "telegram_birthday_log_org_idx" ON "telegram_birthday_log" USING btree ("org_id","sent_at");