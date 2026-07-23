import { and, asc, desc, eq, gte, sql as dsql } from "drizzle-orm";
import {
  employees,
  employeeEvaluations,
  customerCommitments,
  customers,
  sales,
} from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type EmployeeRow = typeof employees.$inferSelect;
export type CommitmentRow = typeof customerCommitments.$inferSelect;

export type EmployeeInput = {
  name: string;
  role?: string;
  phone?: string;
  salaryCents: bigint;
  hiredAt?: string;
  active?: "yes" | "no";
};

export async function createEmployee(
  db: Db,
  orgId: string,
  userId: UserId,
  input: EmployeeInput,
): Promise<EmployeeRow> {
  const [row] = await db
    .insert(employees)
    .values({ ...input, orgId })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "employee",
    entityId: row.id,
    action: "create",
    after: { name: input.name },
  });
  return row;
}

export async function listEmployees(
  db: Db,
  orgId: string,
): Promise<EmployeeRow[]> {
  return db
    .select()
    .from(employees)
    .where(and(eq(employees.orgId, orgId), notDeleted(employees)))
    .orderBy(asc(employees.name));
}

async function getOwnedEmployee(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), notDeleted(employees)));
  return assertOwnedByOrg(row, orgId);
}

export async function updateEmployee(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: EmployeeInput,
): Promise<EmployeeRow> {
  await getOwnedEmployee(db, orgId, id);
  const [row] = await db
    .update(employees)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(employees.id, id), eq(employees.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "employee",
    entityId: id,
    action: "update",
    after: { name: input.name, active: input.active },
  });
  return row;
}

export async function softDeleteEmployee(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  await getOwnedEmployee(db, orgId, id);
  await db
    .update(employees)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(employees.id, id), eq(employees.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "employee",
    entityId: id,
    action: "delete",
  });
}

/** Nómina mensual de empleados activos (alimenta el módulo fiscal). */
export async function activePayrollCents(
  db: Db,
  orgId: string,
): Promise<bigint> {
  const rows: EmployeeRow[] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.orgId, orgId),
        eq(employees.active, "yes"),
        notDeleted(employees),
      ),
    );
  return rows.reduce((acc, e) => acc + e.salaryCents, 0n);
}

// ---------- compromisos de cliente ----------

export async function createCommitment(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    customerId: string;
    description: string;
    frequency: "weekly" | "monthly";
  },
): Promise<CommitmentRow> {
  const [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, input.customerId), notDeleted(customers)));
  assertOwnedByOrg(cust, orgId);
  const [row] = await db
    .insert(customerCommitments)
    .values({ ...input, orgId })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "customer_commitment",
    entityId: row.id,
    action: "create",
    after: { description: input.description },
  });
  return row;
}

export async function deactivateCommitment(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(customerCommitments)
    .where(eq(customerCommitments.id, id));
  assertOwnedByOrg(row, orgId);
  await db
    .update(customerCommitments)
    .set({ active: "no", updatedAt: new Date() })
    .where(eq(customerCommitments.id, id));
  await logAudit(db, {
    orgId,
    userId,
    entity: "customer_commitment",
    entityId: id,
    action: "update",
    after: { active: "no" },
  });
}

function periodStart(frequency: string, now: Date): Date {
  if (frequency === "monthly") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  // semana ISO: lunes 00:00 UTC
  const d = new Date(now);
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Compromisos activos con su estado del período corriente. */
export async function listCommitmentsWithStatus(
  db: Db,
  orgId: string,
  customerId?: string,
): Promise<
  Array<CommitmentRow & { customerName: string; fulfilled: boolean }>
> {
  const filters = [
    eq(customerCommitments.orgId, orgId),
    eq(customerCommitments.active, "yes"),
    notDeleted(customerCommitments),
  ];
  if (customerId) {
    filters.push(eq(customerCommitments.customerId, customerId));
  }
  const rows = await db
    .select({ commitment: customerCommitments, customerName: customers.name })
    .from(customerCommitments)
    .innerJoin(customers, eq(customerCommitments.customerId, customers.id))
    .where(and(...filters));
  const now = new Date();
  const out = [];
  for (const r of rows) {
    const from = periodStart(r.commitment.frequency, now);
    const [sale] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(
        and(
          eq(sales.orgId, orgId),
          eq(sales.customerId, r.commitment.customerId),
          eq(sales.status, "confirmed"),
          gte(sales.soldAt, from),
        ),
      )
      .limit(1);
    out.push({
      ...r.commitment,
      customerName: r.customerName,
      fulfilled: Boolean(sale),
    });
  }
  return out;
}

/** Ranking de clientes por ventas confirmadas (en moneda base). */
export async function topCustomers(
  db: Db,
  orgId: string,
  limit: number,
): Promise<
  Array<{ id: string; name: string; totalBaseCents: bigint; count: number }>
> {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      total: dsql<string>`coalesce(sum(${sales.totalBaseCents}), 0)`,
      count: dsql<string>`count(${sales.id})`,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.orgId, orgId), eq(sales.status, "confirmed")))
    .groupBy(customers.id, customers.name)
    .orderBy(desc(dsql`sum(${sales.totalBaseCents})`))
    .limit(limit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    totalBaseCents: BigInt(r.total),
    count: Number(r.count),
  }));
}

export type EvaluationRow = typeof employeeEvaluations.$inferSelect;

/** Evaluación 1–5 con comentario; la fecha por defecto es hoy (F5). */
export async function addEvaluation(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    employeeId: string;
    score: number;
    notes?: string;
    evaluatedAt?: string;
  },
): Promise<EvaluationRow> {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    throw new Error("La nota va de 1 a 5");
  }
  await getOwnedEmployee(db, orgId, input.employeeId);
  const [row] = await db
    .insert(employeeEvaluations)
    .values({
      orgId,
      employeeId: input.employeeId,
      score: input.score,
      notes: input.notes,
      ...(input.evaluatedAt ? { evaluatedAt: input.evaluatedAt } : {}),
    })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "employee_evaluation",
    entityId: row.id,
    action: "create",
    after: { employeeId: input.employeeId, score: input.score },
  });
  return row;
}

export async function listEvaluations(
  db: Db,
  orgId: string,
  employeeId: string,
): Promise<EvaluationRow[]> {
  await getOwnedEmployee(db, orgId, employeeId);
  return db
    .select()
    .from(employeeEvaluations)
    .where(
      and(
        eq(employeeEvaluations.orgId, orgId),
        eq(employeeEvaluations.employeeId, employeeId),
      ),
    )
    .orderBy(
      desc(employeeEvaluations.evaluatedAt),
      desc(employeeEvaluations.createdAt),
    );
}

/** Última nota y promedio por empleado (para la tabla de RRHH). */
export async function evaluationSummary(
  db: Db,
  orgId: string,
): Promise<Map<string, { last: number; avg: number; count: number }>> {
  const rows = await db
    .select({
      employeeId: employeeEvaluations.employeeId,
      avg: dsql<number>`avg(${employeeEvaluations.score})`.mapWith(Number),
      count: dsql<number>`count(*)`.mapWith(Number),
      last: dsql<number>`(array_agg(${employeeEvaluations.score} order by ${employeeEvaluations.evaluatedAt} desc, ${employeeEvaluations.createdAt} desc))[1]`.mapWith(
        Number,
      ),
    })
    .from(employeeEvaluations)
    .where(eq(employeeEvaluations.orgId, orgId))
    .groupBy(employeeEvaluations.employeeId);
  return new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows.map((r: any) => [
      r.employeeId,
      { last: r.last, avg: Math.round(r.avg * 10) / 10, count: r.count },
    ]),
  );
}
