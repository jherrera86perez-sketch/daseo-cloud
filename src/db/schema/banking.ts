import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  date,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    bank: text("bank"),
    accountNumber: text("account_number"),
    currency: text("currency").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("bank_accounts_org_idx").on(t.orgId, t.name),
    check(
      "bank_accounts_currency_check",
      sql`${t.currency} in ('CUP','USD','BRL')`,
    ),
  ],
);

/**
 * Movimientos importados del banco (CSV). `dedupHash` evita duplicados al
 * reimportar el mismo archivo. Monto con signo: + entra, − sale.
 */
export const bankMovements = pgTable(
  "bank_movements",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    movementDate: date("movement_date").notNull(),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    reference: text("reference"),
    dedupHash: text("dedup_hash").notNull(),
    status: text("status").notNull().default("pending"),
    // conciliación: cobro de venta o pago a proveedor vinculado
    matchedPaymentId: uuid("matched_payment_id"),
    matchedSupplierPaymentId: uuid("matched_supplier_payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bank_movements_dedup_idx").on(t.bankAccountId, t.dedupHash),
    index("bank_movements_org_account_idx").on(
      t.orgId,
      t.bankAccountId,
      t.movementDate,
    ),
    check(
      "bank_movements_status_check",
      sql`${t.status} in ('pending','matched','ignored')`,
    ),
    check("bank_movements_amount_check", sql`${t.amountCents} <> 0`),
  ],
);
