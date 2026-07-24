import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  numeric,
  date,
  integer,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations, users } from "./core";
import { productionOrders } from "./production";
import { employees } from "./people";

/**
 * Mano de obra por empleado por orden de producción (≈ produccion_mano_obra
 * del ERP). El devengado se calcula SIEMPRE como Σ(horas × costo_hora) — no
 * se guarda subtotal, igual que en el ERP.
 */
export const productionLabor = pgTable(
  "production_labor",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrders.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    hours: numeric("hours", { precision: 10, scale: 2 }).notNull(),
    costHourCents: bigint("cost_hour_cents", { mode: "bigint" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("production_labor_order_idx").on(t.orderId),
    index("production_labor_org_emp_idx").on(t.orgId, t.employeeId),
    check("production_labor_hours_check", sql`${t.hours} > 0`),
    check("production_labor_cost_check", sql`${t.costHourCents} >= 0`),
  ],
);

/**
 * Observaciones diarias ricas de empleados (≈ empleado_evaluaciones del ERP:
 * órdenes/merma/defectos/horas por día). Convive con employee_evaluations
 * (score 1–5, F5). UPSERT por (org, empleado, fecha) — /observacion-dia.
 */
export const employeeDayEvaluations = pgTable(
  "employee_day_evaluations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    date: date("date").notNull(),
    ordersProduced: integer("orders_produced").notNull().default(0),
    wasteProduced: numeric("waste_produced", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    defects: integer("defects").notNull().default(0),
    hoursWorked: numeric("hours_worked", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("employee_day_evaluations_unique_idx").on(
      t.orgId,
      t.employeeId,
      t.date,
    ),
    index("employee_day_evaluations_date_idx").on(t.orgId, t.date),
  ],
);

/**
 * Seguimiento de recomendaciones del asistente directivo (≈
 * asistente_seguimiento del ERP). recommendation_id es el id sintético de la
 * recomendación (inv_5, prod_pendientes, fracc_juana_pena…) — UPSERT por org.
 */
export const assistantFollowups = pgTable(
  "assistant_followups",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    recommendationId: text("recommendation_id").notNull(),
    title: text("title").notNull(),
    category: text("category"),
    status: text("status").notNull().default("PENDIENTE"),
    notes: text("notes"),
    userId: uuid("user_id").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("assistant_followups_unique_idx").on(
      t.orgId,
      t.recommendationId,
    ),
    index("assistant_followups_status_idx").on(t.orgId, t.status),
    index("assistant_followups_category_idx").on(t.orgId, t.category),
    check(
      "assistant_followups_status_check",
      sql`${t.status} in ('PENDIENTE','EN_PROGRESO','COMPLETADA','DESCARTADA')`,
    ),
  ],
);
