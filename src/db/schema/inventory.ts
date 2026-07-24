import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  bigserial,
  boolean,
  numeric,
  integer,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";

// ≈ categoria del ERP: agrupador visual que fija los defaults de los flags
// es_vendible/es_componente/es_producible al crear (no una jerarquía real)
export const PRODUCT_CATEGORIES = [
  "insumo",
  "semi_elaborado",
  "producto_final",
  "servicio",
] as const;

export const products = pgTable(
  "products",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    sku: text("sku"),
    // ≈ codigo_barras del ERP: obligatorio salvo categoría 'servicio'
    barcode: text("barcode"),
    category: text("category"),
    description: text("description"),
    unit: text("unit").notNull().default("unit"),
    priceCents: bigint("price_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    currency: text("currency"),
    isSellable: boolean("is_sellable").notNull().default(true),
    isComponent: boolean("is_component").notNull().default(false),
    isProducible: boolean("is_producible").notNull().default(false),
    stockMin: numeric("stock_min", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    // ≈ stock_minimo_modo del ERP: 'manual' (default) o 'auto' (cron ROP)
    stockMinMode: text("stock_min_mode").notNull().default("manual"),
    leadDays: integer("lead_days").notNull().default(7),
    safetyDays: integer("safety_days").notNull().default(3),
    stockMinCalculated: numeric("stock_min_calculated", {
      precision: 14,
      scale: 3,
    }),
    stockMinCalculatedAt: timestamp("stock_min_calculated_at", {
      withTimezone: true,
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_org_sku_idx")
      .on(t.orgId, t.sku)
      .where(sql`${t.sku} is not null`),
    index("products_org_idx").on(t.orgId, t.name),
    check("products_price_check", sql`${t.priceCents} >= 0`),
    check("products_unit_check", sql`${t.unit} in ('kg','L','unit')`),
    check(
      "products_category_check",
      sql`${t.category} is null or ${t.category} in ('insumo','semi_elaborado','producto_final','servicio')`,
    ),
    check(
      "products_stock_min_mode_check",
      sql`${t.stockMinMode} in ('manual','auto')`,
    ),
  ],
);

/**
 * EL kardex: libro de movimientos append-only. Cada fila guarda el saldo y
 * costo promedio resultantes (en moneda base). Correcciones = ajustes, nunca
 * UPDATE/DELETE. `purchase` e `internal_use` existen desde F1 aunque su UI
 * llegue en F2/F5 (hook de retrofit del plan).
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    // Orden TOTAL de asiento: dentro de una transacción now() es constante y
    // el id uuid no ordena — el saldo vigente es el de mayor seq.
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    type: text("type").notNull(),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unitCostBaseCents: bigint("unit_cost_base_cents", { mode: "bigint" }),
    balanceQty: numeric("balance_qty", { precision: 14, scale: 3 }).notNull(),
    balanceAvgCostBaseCents: bigint("balance_avg_cost_base_cents", {
      mode: "bigint",
    }).notNull(),
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: uuid("source_id"),
    // F2: entrada por compra puede pertenecer a un lote (sin FK circular:
    // lots vive en purchases.ts; la integridad la garantiza la capa de datos)
    lotId: uuid("lot_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inventory_movements_org_product_idx").on(
      t.orgId,
      t.productId,
      t.createdAt,
    ),
    check("inventory_movements_qty_check", sql`${t.qty} <> 0`),
    check(
      "inventory_movements_balance_check",
      sql`${t.balanceQty} >= 0 and ${t.balanceAvgCostBaseCents} >= 0`,
    ),
    check(
      "inventory_movements_source_check",
      sql`${t.sourceType} in ('manual','sale','production_in','production_out','purchase','adjustment','internal_use')`,
    ),
  ],
);
