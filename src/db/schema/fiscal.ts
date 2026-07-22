import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";

/** Obligaciones ONAT del mes (calculadas por el motor fiscal, por org). */
export const taxObligations = pgTable(
  "tax_obligations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    conceptCode: text("concept_code").notNull(),
    name: text("name").notNull(),
    baseCents: bigint("base_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    status: text("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tax_obligations_scope_idx").on(
      t.orgId,
      t.year,
      t.month,
      t.conceptCode,
    ),
    check(
      "tax_obligations_status_check",
      sql`${t.status} in ('pending','paid')`,
    ),
    check("tax_obligations_month_check", sql`${t.month} between 1 and 12`),
  ],
);
