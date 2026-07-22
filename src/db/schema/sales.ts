import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  numeric,
  jsonb,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";
import { customers, deals } from "./crm";
import { products } from "./inventory";

const moneyDoc = {
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
};

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    dealId: uuid("deal_id").references(() => deals.id),
    series: text("series").notNull().default("A"),
    year: integer("year").notNull(),
    number: integer("number").notNull(),
    status: text("status").notNull().default("draft"),
    ...moneyDoc,
    discountCents: bigint("discount_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("quotes_number_idx").on(t.orgId, t.series, t.year, t.number),
    check(
      "quotes_status_check",
      sql`${t.status} in ('draft','sent','accepted','rejected')`,
    ),
    check("quotes_totals_check", sql`${t.totalCents} >= 0`),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id),
    productId: uuid("product_id").references(() => products.id),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "bigint" }).notNull(),
    totalCents: bigint("total_cents", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("quote_items_quote_idx").on(t.quoteId),
    check("quote_items_qty_check", sql`${t.qty} > 0`),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    quoteId: uuid("quote_id").references(() => quotes.id),
    series: text("series").notNull().default("A"),
    year: integer("year").notNull(),
    // null en borradores; se asigna al confirmar (numeración sin huecos)
    number: integer("number"),
    status: text("status").notNull().default("draft"),
    ...moneyDoc,
    soldAt: timestamp("sold_at", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    // doble clic jamás duplica una venta (unique parcial por org)
    idempotencyKey: uuid("idempotency_key"),
    // reservado para el plugin fiscal por país (F4)
    fiscalData: jsonb("fiscal_data"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sales_number_idx")
      .on(t.orgId, t.series, t.year, t.number)
      .where(sql`${t.number} is not null`),
    uniqueIndex("sales_idempotency_idx")
      .on(t.orgId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("sales_org_customer_idx").on(t.orgId, t.customerId),
    check(
      "sales_status_check",
      sql`${t.status} in ('draft','confirmed','cancelled')`,
    ),
    check("sales_totals_check", sql`${t.totalCents} >= 0`),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    productId: uuid("product_id").references(() => products.id),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "bigint" }).notNull(),
    totalCents: bigint("total_cents", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("sale_items_sale_idx").on(t.saleId),
    check("sale_items_qty_check", sql`${t.qty} > 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    rateFixed: numeric("rate_fixed", { precision: 18, scale: 6 }).notNull(),
    appliedCents: bigint("applied_cents", { mode: "bigint" }).notNull(),
    method: text("method").notNull().default("cash"),
    // F3: conciliación bancaria (sin FK circular; banking.ts la define)
    bankAccountId: uuid("bank_account_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payments_org_sale_idx").on(t.orgId, t.saleId),
    check("payments_amount_check", sql`${t.amountCents} > 0`),
    check("payments_applied_check", sql`${t.appliedCents} > 0`),
    check(
      "payments_method_check",
      sql`${t.method} in ('cash','transfer','other')`,
    ),
  ],
);
