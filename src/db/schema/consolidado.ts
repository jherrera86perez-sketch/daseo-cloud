import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  numeric,
  boolean,
  check,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";

/**
 * `consolidado_bancario` del ERP CubaOne: el libro contable. Se alimenta de
 * 3 orígenes — importar movimientos del banco (conciliación), entradas
 * manuales y egresos de salidas internas. Adaptaciones del port: org_id,
 * fecha_contable normalizada a date (el ERP tenía formato mixto), importe
 * SIEMPRE en valor absoluto (el signo lo da tipo_transaccion) y CHECKs para
 * los enums de facto. `statementMovementId` = movimiento_cuenta_id
 * (referencia blanda; la limpieza al borrar statements la hace la capa de
 * datos, como la cascada del ERP).
 */
export const consolidatedEntries = pgTable(
  "consolidated_entries",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    archivoNombre: text("archivo_nombre"),
    fechaContable: date("fecha_contable").notNull(),
    dia: integer("dia"),
    mes: integer("mes"),
    anio: integer("anio"),
    referencia: text("referencia"),
    tipoTransaccion: text("tipo_transaccion").notNull(),
    importe: numeric("importe", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    saldo: numeric("saldo", { precision: 14, scale: 2 }),
    observaciones: text("observaciones"),
    categoria: text("categoria"),
    subcategoria: text("subcategoria"),
    detalle: text("detalle"),
    conciliado: boolean("conciliado").notNull().default(false),
    clienteNombre: text("cliente_nombre"),
    telefono: text("telefono"),
    pan: text("pan"),
    tipoOperacion: text("tipo_operacion"),
    statementMovementId: uuid("statement_movement_id"),
    origen: text("origen").notNull().default("manual"),
    auditStatus: text("audit_status").notNull().default("PENDIENTE"),
    ...timestamps,
  },
  (t) => [
    index("consolidated_org_anio_mes_idx").on(t.orgId, t.anio, t.mes),
    index("consolidated_org_categoria_idx").on(t.orgId, t.categoria),
    index("consolidated_org_subcategoria_idx").on(t.orgId, t.subcategoria),
    index("consolidated_movimiento_idx").on(t.statementMovementId),
    index("consolidated_org_cliente_idx").on(t.orgId, t.clienteNombre),
    check("consolidated_tipo_check", sql`${t.tipoTransaccion} in ('CR','DB')`),
    check("consolidated_importe_check", sql`${t.importe} >= 0`),
    check(
      "consolidated_origen_check",
      sql`${t.origen} in ('banco','manual','salida_interna')`,
    ),
    check(
      "consolidated_audit_check",
      sql`${t.auditStatus} in ('PENDIENTE','CONCILIADO','MANUAL')`,
    ),
  ],
);
