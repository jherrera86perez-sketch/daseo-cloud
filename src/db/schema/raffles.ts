import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps, organizations } from "./core";

/**
 * F8-M4 — Sorteos (tabla `sorteos` del ERP CubaOne, subsistema activo).
 * Un registro por sorteo ejecutado: período, nº de participantes y el
 * ganador con sus métricas del mes. SIN unique por mes (el ERP permite
 * repetir el sorteo del mismo período). Sin premio configurable.
 */
export const raffles = pgTable(
  "raffles",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    nombre: text("nombre").notNull(),
    mes: integer("mes").notNull(),
    anio: integer("anio").notNull(),
    numParticipantes: integer("num_participantes").notNull().default(0),
    ganadorClientName: text("ganador_client_name").notNull(),
    ganadorPan: text("ganador_pan"),
    ganadorTelefono: text("ganador_telefono"),
    ganadorNumOps: integer("ganador_num_ops").notNull().default(0),
    ganadorTotalCreditos: numeric("ganador_total_creditos", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    fechaSorteo: timestamp("fecha_sorteo", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (t) => [index("raffles_org_idx").on(t.orgId, t.fechaSorteo)],
);
