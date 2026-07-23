import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  check,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";

/**
 * F8 — Estados de cuenta BPA (port fiel del ERP CubaOne).
 * `statements` = cabecera del PDF importado (estados_cuenta del ERP).
 * Importes en numeric(14,2): mismos 2 decimales que el banco declara.
 * Las fechas del PDF se guardan tal cual (DD/MM/YYYY) como en el ERP;
 * el análisis usa fecha_iso/mes/anio de los movimientos.
 */
export const statements = pgTable(
  "statements",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    filename: text("filename").notNull(),
    cuentaInterna: text("cuenta_interna"),
    cuentaEstandarizada: text("cuenta_estandarizada"),
    titular: text("titular"),
    fechaInicio: text("fecha_inicio"),
    fechaFin: text("fecha_fin"),
    saldoInicial: numeric("saldo_inicial", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    saldoFinal: numeric("saldo_final", { precision: 14, scale: 2 }),
    totalCreditos: numeric("total_creditos", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    totalDebitos: numeric("total_debitos", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    numOperaciones: integer("num_operaciones").notNull().default(0),
    /** true si la validación aritmética del parser cuadró (tolerancia 0.02) */
    cuadrado: boolean("cuadrado").notNull().default(true),
    validacionMensajes: text("validacion_mensajes"),
    ...timestamps,
  },
  (t) => [index("statements_org_idx").on(t.orgId, t.createdAt)],
);

/** movimientos_cuenta del ERP: la materia prima cruda del PDF. */
export const statementMovements = pgTable(
  "statement_movements",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => statements.id, { onDelete: "cascade" }),
    /** orden original dentro del PDF (el ERP usa rowid) */
    position: integer("position").notNull(),
    fecha: text("fecha"), // DD/MM/YYYY tal cual
    fechaIso: date("fecha_iso"),
    mes: integer("mes"),
    anio: integer("anio"),
    referencia: text("referencia"),
    operacion: text("operacion"),
    importe: numeric("importe", { precision: 14, scale: 2 }),
    saldo: numeric("saldo", { precision: 14, scale: 2 }),
    observacion: text("observacion"),
    clientName: text("client_name"),
    panOrigen: text("pan_origen"),
    tipoTransaccion: text("tipo_transaccion"),
    telefono: text("telefono"),
    conciliado: boolean("conciliado").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("statement_movements_stmt_idx").on(t.statementId, t.position),
    index("statement_movements_org_period_idx").on(t.orgId, t.anio, t.mes),
    index("statement_movements_client_idx").on(t.orgId, t.clientName),
    check(
      "statement_movements_operacion_check",
      sql`${t.operacion} in ('CR','DB','')`,
    ),
  ],
);
