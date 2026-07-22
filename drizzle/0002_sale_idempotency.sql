DROP INDEX "sales_number_idx";--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_idempotency_idx" ON "sales" USING btree ("org_id","idempotency_key") WHERE "sales"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_number_idx" ON "sales" USING btree ("org_id","series","year","number") WHERE "sales"."number" is not null;