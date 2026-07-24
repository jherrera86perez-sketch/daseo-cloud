import { and, asc, desc, eq, gte, sql as dsql } from "drizzle-orm";
import {
  employees,
  employeeEvaluations,
  employeeDayEvaluations,
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

// ─── Observaciones diarias ricas (≈ empleado_evaluaciones del ERP) ───

export type DayEvaluationRow = typeof employeeDayEvaluations.$inferSelect;

export type DayObservationInput = {
  employeeId: string;
  fecha: string; // YYYY-MM-DD
  ordenesProducidas?: number;
  mermaProducida?: string;
  defectos?: number;
  horasTrabajadas?: string;
  notas?: string;
};

/**
 * Crea o actualiza la observación manual de un empleado en un día específico
 * (POST /observacion-dia del ERP): al actualizar solo pisa los campos
 * presentes (COALESCE del ERP). Mensajes literales.
 */
export async function addDayObservation(
  db: Db,
  orgId: string,
  userId: UserId,
  input: DayObservationInput,
): Promise<{ message: string; id: string }> {
  if (!input.employeeId || !input.fecha) {
    throw new Error("empleado_id y fecha son requeridos");
  }
  await getOwnedEmployee(db, orgId, input.employeeId);

  const [existing] = await db
    .select({ id: employeeDayEvaluations.id })
    .from(employeeDayEvaluations)
    .where(
      and(
        eq(employeeDayEvaluations.orgId, orgId),
        eq(employeeDayEvaluations.employeeId, input.employeeId),
        eq(employeeDayEvaluations.date, input.fecha),
      ),
    );

  if (existing) {
    await db
      .update(employeeDayEvaluations)
      .set({
        ...(input.mermaProducida !== undefined
          ? { wasteProduced: input.mermaProducida.replace(",", ".") }
          : {}),
        ...(input.defectos !== undefined ? { defects: input.defectos } : {}),
        ...(input.notas !== undefined ? { notes: input.notas } : {}),
        ...(input.horasTrabajadas !== undefined
          ? { hoursWorked: input.horasTrabajadas.replace(",", ".") }
          : {}),
        ...(input.ordenesProducidas !== undefined
          ? { ordersProduced: input.ordenesProducidas }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(employeeDayEvaluations.id, existing.id));
    await logAudit(db, {
      orgId,
      userId,
      entity: "employee_day_evaluation",
      entityId: existing.id,
      action: "update",
      after: { employeeId: input.employeeId, fecha: input.fecha },
    });
    return { message: "Observación actualizada", id: existing.id };
  }

  const [row] = await db
    .insert(employeeDayEvaluations)
    .values({
      orgId,
      employeeId: input.employeeId,
      date: input.fecha,
      ordersProduced: input.ordenesProducidas ?? 0,
      wasteProduced: (input.mermaProducida ?? "0").replace(",", "."),
      defects: input.defectos ?? 0,
      hoursWorked: (input.horasTrabajadas ?? "0").replace(",", "."),
      notes: input.notas ?? null,
    })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "employee_day_evaluation",
    entityId: row.id,
    action: "create",
    after: { employeeId: input.employeeId, fecha: input.fecha },
  });
  return { message: "Observación creada", id: row.id };
}

/** Historial de observaciones de un empleado (default: últimos 30 días). */
export async function listDayEvaluations(
  db: Db,
  orgId: string,
  employeeId: string,
  dias = 30,
): Promise<DayEvaluationRow[]> {
  const hace = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return db
    .select()
    .from(employeeDayEvaluations)
    .where(
      and(
        eq(employeeDayEvaluations.orgId, orgId),
        eq(employeeDayEvaluations.employeeId, employeeId),
        gte(employeeDayEvaluations.date, hace),
      ),
    )
    .orderBy(desc(employeeDayEvaluations.date));
}

export async function deleteDayEvaluation(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<{ message: string }> {
  const [row] = await db
    .delete(employeeDayEvaluations)
    .where(
      and(
        eq(employeeDayEvaluations.id, id),
        eq(employeeDayEvaluations.orgId, orgId),
      ),
    )
    .returning({ id: employeeDayEvaluations.id });
  if (!row) throw new Error("Evaluación no encontrada");
  await logAudit(db, {
    orgId,
    userId,
    entity: "employee_day_evaluation",
    entityId: id,
    action: "delete",
  });
  return { message: "Evaluación eliminada" };
}

export type EvaluacionAutoDia = {
  fecha: string;
  ordenes: number;
  horas: number;
  devengado: number;
  unidades: number;
  merma_orden: number;
  costo_hora_prom: number;
  productos: string | null;
  observacion_id: string | null;
  merma_observada: number;
  defectos: number;
  notas: string | null;
  es_solo_observacion: boolean;
};

export type EvaluacionAuto = {
  empleado: EmployeeRow;
  dias: EvaluacionAutoDia[];
  totales: {
    ordenes: number;
    horas: number;
    devengado: number;
    unidades: number;
    merma_total: number;
    defectos_total: number;
    dias_trabajados: number;
  };
  desde: string;
  hasta: string;
};

/**
 * Evaluación automática de un empleado (GET /evaluacion-auto del ERP):
 * producción real por día (production_labor) + observaciones manuales.
 * Default: 30 días hacia atrás.
 */
export async function evaluacionAuto(
  db: Db,
  orgId: string,
  employeeId: string,
  rango: { desde?: string; hasta?: string },
): Promise<EvaluacionAuto> {
  const hoy = new Date();
  const desde = rango.desde
    ? rango.desde.length === 10
      ? `${rango.desde}T00:00:00.000Z`
      : rango.desde
    : new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const hasta = rango.hasta
    ? rango.hasta.length === 10
      ? `${rango.hasta}T23:59:59.999Z`
      : rango.hasta
    : hoy.toISOString();

  const [empleado] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.orgId, orgId)));
  if (!empleado) throw new Error("Empleado no encontrado");

  type ProdDia = {
    fecha: string;
    ordenes: number;
    horas: number;
    devengado: number;
    unidades: number;
    merma_orden: number;
    costo_hora_prom: number;
    productos: string | null;
  };
  const prodRes = await db.execute(dsql`
    SELECT
      to_char(o.created_at, 'YYYY-MM-DD') AS fecha,
      COUNT(DISTINCT pl.order_id)::int AS ordenes,
      COALESCE(SUM(pl.hours), 0)::float AS horas,
      COALESCE(SUM(pl.hours * pl.cost_hour_cents::float / 100), 0)::float AS devengado,
      COALESCE(SUM(COALESCE(o.produced_qty, 0) - COALESCE(o.waste_qty, 0)), 0)::float AS unidades,
      COALESCE(SUM(COALESCE(o.waste_qty, 0)), 0)::float AS merma_orden,
      COALESCE(AVG(pl.cost_hour_cents::float / 100), 0)::float AS costo_hora_prom,
      STRING_AGG(DISTINCT p.name, ',') AS productos
    FROM production_labor pl
    JOIN production_orders o ON pl.order_id = o.id
    JOIN products p ON p.id = o.product_id
    WHERE pl.employee_id = ${employeeId} AND o.org_id = ${orgId}
      AND o.created_at >= ${desde}::timestamptz
      AND o.created_at <= ${hasta}::timestamptz
    GROUP BY to_char(o.created_at, 'YYYY-MM-DD')
    ORDER BY fecha DESC
  `);
  const produccionPorDia = (prodRes.rows ?? prodRes) as ProdDia[];

  const observaciones: DayEvaluationRow[] = await db
    .select()
    .from(employeeDayEvaluations)
    .where(
      and(
        eq(employeeDayEvaluations.orgId, orgId),
        eq(employeeDayEvaluations.employeeId, employeeId),
        gte(employeeDayEvaluations.date, desde.slice(0, 10)),
        dsql`${employeeDayEvaluations.date} <= ${hasta.slice(0, 10)}`,
      ),
    )
    .orderBy(desc(employeeDayEvaluations.date));

  const obsByFecha: Record<string, DayEvaluationRow> = {};
  observaciones.forEach((o) => {
    obsByFecha[o.date] = o;
  });

  const fechasUnion = new Set([
    ...produccionPorDia.map((p) => p.fecha),
    ...observaciones.map((o) => o.date),
  ]);

  const dias: EvaluacionAutoDia[] = Array.from(fechasUnion)
    .sort((a, b) => b.localeCompare(a))
    .map((fecha) => {
      const prod = produccionPorDia.find((p) => p.fecha === fecha);
      const obs = obsByFecha[fecha];
      return {
        fecha,
        ordenes: prod?.ordenes || 0,
        horas: prod?.horas || 0,
        devengado: prod?.devengado || 0,
        unidades: prod?.unidades || 0,
        merma_orden: prod?.merma_orden || 0,
        costo_hora_prom: prod?.costo_hora_prom || 0,
        productos: prod?.productos || null,
        observacion_id: obs?.id || null,
        merma_observada: obs ? Number(obs.wasteProduced) || 0 : 0,
        defectos: obs?.defects || 0,
        notas: obs?.notes || null,
        es_solo_observacion: !prod && !!obs,
      };
    });

  const totales = {
    ordenes: dias.reduce((s, d) => s + d.ordenes, 0),
    horas: dias.reduce((s, d) => s + d.horas, 0),
    devengado: dias.reduce((s, d) => s + d.devengado, 0),
    unidades: dias.reduce((s, d) => s + d.unidades, 0),
    merma_total: dias.reduce(
      (s, d) => s + d.merma_orden + d.merma_observada,
      0,
    ),
    defectos_total: dias.reduce((s, d) => s + d.defectos, 0),
    dias_trabajados: dias.length,
  };

  return { empleado, dias, totales, desde, hasta };
}
