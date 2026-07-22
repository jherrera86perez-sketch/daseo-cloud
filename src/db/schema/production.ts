import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  numeric,
  check,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";
import { products } from "./inventory";

export const recipes = pgTable(
  "recipes",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    outputQty: numeric("output_qty", { precision: 14, scale: 3 }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("recipes_org_idx").on(t.orgId, t.productId),
    check("recipes_output_check", sql`${t.outputQty} > 0`),
  ],
);

export const recipeItems = pgTable(
  "recipe_items",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    index("recipe_items_recipe_idx").on(t.recipeId),
    check("recipe_items_qty_check", sql`${t.qty} > 0`),
  ],
);

export const productionOrders = pgTable(
  "production_orders",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    status: text("status").notNull().default("draft"),
    producedQty: numeric("produced_qty", { precision: 14, scale: 3 }),
    laborCostBaseCents: bigint("labor_cost_base_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    overheadBaseCents: bigint("overhead_base_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("production_orders_org_idx").on(t.orgId, t.createdAt),
    check(
      "production_orders_status_check",
      sql`${t.status} in ('draft','confirmed','cancelled')`,
    ),
    check(
      "production_orders_costs_check",
      sql`${t.laborCostBaseCents} >= 0 and ${t.overheadBaseCents} >= 0`,
    ),
  ],
);

export const productionInputs = pgTable(
  "production_inputs",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrders.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    plannedQty: numeric("planned_qty", { precision: 14, scale: 3 }).notNull(),
    actualQty: numeric("actual_qty", { precision: 14, scale: 3 }),
    unitCostBaseCents: bigint("unit_cost_base_cents", { mode: "bigint" }),
  },
  (t) => [
    index("production_inputs_order_idx").on(t.orderId),
    check("production_inputs_planned_check", sql`${t.plannedQty} > 0`),
  ],
);
