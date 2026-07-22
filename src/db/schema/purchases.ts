import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  numeric,
  date,
  jsonb,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";
import { products } from "./inventory";

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("suppliers_org_idx").on(t.orgId, t.name)],
);

/** Lotes: nacen en la recepción de compra; vencimiento opcional. */
export const lots = pgTable(
  "lots",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    code: text("code").notNull(),
    expiryDate: date("expiry_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lots_org_product_code_idx").on(t.orgId, t.productId, t.code),
    index("lots_org_expiry_idx").on(t.orgId, t.expiryDate),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    series: text("series").notNull().default("A"),
    year: integer("year").notNull(),
    // null en borradores; se asigna al confirmar
    number: integer("number"),
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull(),
    rateToBaseFixed: numeric("rate_to_base_fixed", {
      precision: 18,
      scale: 6,
    }).notNull(),
    totalCents: bigint("total_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    totalBaseCents: bigint("total_base_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    idempotencyKey: uuid("idempotency_key"),
    fiscalData: jsonb("fiscal_data"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("purchases_number_idx")
      .on(t.orgId, t.series, t.year, t.number)
      .where(sql`${t.number} is not null`),
    uniqueIndex("purchases_idempotency_idx")
      .on(t.orgId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("purchases_org_supplier_idx").on(t.orgId, t.supplierId),
    check(
      "purchases_status_check",
      sql`${t.status} in ('draft','confirmed','cancelled')`,
    ),
    check("purchases_totals_check", sql`${t.totalCents} >= 0`),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    productId: uuid("product_id").references(() => products.id),
    lotId: uuid("lot_id").references(() => lots.id),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unitCostCents: bigint("unit_cost_cents", { mode: "bigint" }).notNull(),
    totalCents: bigint("total_cents", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("purchase_items_purchase_idx").on(t.purchaseId),
    check("purchase_items_qty_check", sql`${t.qty} > 0`),
    check("purchase_items_cost_check", sql`${t.unitCostCents} >= 0`),
  ],
);

/** Pagos a proveedores (CxP): espejo de payments. */
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    rateFixed: numeric("rate_fixed", { precision: 18, scale: 6 }).notNull(),
    appliedCents: bigint("applied_cents", { mode: "bigint" }).notNull(),
    method: text("method").notNull().default("cash"),
    // F3: conciliación bancaria
    bankAccountId: uuid("bank_account_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("supplier_payments_org_purchase_idx").on(t.orgId, t.purchaseId),
    check("supplier_payments_amount_check", sql`${t.amountCents} > 0`),
    check("supplier_payments_applied_check", sql`${t.appliedCents} > 0`),
    check(
      "supplier_payments_method_check",
      sql`${t.method} in ('cash','transfer','other')`,
    ),
  ],
);
