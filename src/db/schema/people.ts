import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  date,
  check,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";
import { customers } from "./crm";

/** Empleados (RRHH). El salario alimenta la nómina del módulo fiscal. */
export const employees = pgTable(
  "employees",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    salaryCents: bigint("salary_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    hiredAt: date("hired_at"),
    active: text("active").notNull().default("yes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("employees_org_idx").on(t.orgId, t.name),
    check("employees_salary_check", sql`${t.salaryCents} >= 0`),
    check("employees_active_check", sql`${t.active} in ('yes','no')`),
  ],
);

/**
 * Compromisos recurrentes de cliente (caso J-Carlos: cantidad fija semanal
 * de detergente o su equivalente). Cumplido = venta confirmada al cliente
 * dentro del período corriente.
 */
export const customerCommitments = pgTable(
  "customer_commitments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    description: text("description").notNull(),
    frequency: text("frequency").notNull().default("weekly"),
    active: text("active").notNull().default("yes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("customer_commitments_org_idx").on(t.orgId, t.customerId),
    check(
      "customer_commitments_frequency_check",
      sql`${t.frequency} in ('weekly','monthly')`,
    ),
    check(
      "customer_commitments_active_check",
      sql`${t.active} in ('yes','no')`,
    ),
  ],
);
