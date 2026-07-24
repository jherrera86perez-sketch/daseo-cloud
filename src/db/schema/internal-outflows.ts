import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  bigint,
  date,
  numeric,
  check,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";
import { employees } from "./people";
import { products } from "./inventory";

/**
 * Salidas internas (port fiel de `salidas_internas` del ERP CubaOne):
 * salidas NO-venta — Donación / Regalo / Autoconsumo / Trabajadores.
 * Sin máquina de estados: el efecto (stock + banco) se aplica al crear y
 * se revierte íntegro al eliminar; editar = revertir + recrear (re-numera).
 * `consolidadoId` = consolidado_bancario_id del ERP (referencia blanda al
 * egreso DB con origen='salida_interna' en consolidated_entries).
 */
export const internalOutflows = pgTable(
  "internal_outflows",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    fecha: date("fecha").notNull(),
    tipo: text("tipo").notNull(),
    destinoNombre: text("destino_nombre"),
    employeeId: uuid("employee_id").references(() => employees.id),
    montoEfectivoCents: bigint("monto_efectivo_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    valorProductosCents: bigint("valor_productos_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    consolidadoId: uuid("consolidado_id"),
    motivo: text("motivo"),
    notas: text("notas"),
    ...timestamps,
  },
  (t) => [
    index("internal_outflows_org_fecha_idx").on(t.orgId, t.fecha),
    index("internal_outflows_org_tipo_idx").on(t.orgId, t.tipo),
    check(
      "internal_outflows_tipo_check",
      sql`${t.tipo} in ('DONACION','REGALO','AUTOCONSUMO','TRABAJADORES')`,
    ),
    check(
      "internal_outflows_efectivo_check",
      sql`${t.montoEfectivoCents} >= 0`,
    ),
  ],
);

/** Detalle: nombre desnormalizado y costos congelados como en el ERP. */
export const internalOutflowItems = pgTable(
  "internal_outflow_items",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    outflowId: uuid("outflow_id")
      .notNull()
      .references(() => internalOutflows.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productName: text("product_name"),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit"),
    unitCostCents: bigint("unit_cost_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    totalCostCents: bigint("total_cost_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    index("internal_outflow_items_outflow_idx").on(t.outflowId),
    check("internal_outflow_items_qty_check", sql`${t.qty} > 0`),
  ],
);
