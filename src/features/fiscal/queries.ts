import { and, eq, gte, lt, sql } from "drizzle-orm";
import {
  taxObligations,
  sales,
  orgSettings,
  statementMovements,
} from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { parseDecimalToCents } from "@/lib/money";
import { getFiscalEngine, type AnnualProjection } from "@/lib/fiscal";
import {
  SALES_CATEGORIES,
  NON_OPERATING_INCOME_CATEGORIES,
  DEDUCTIBLE_EXPENSE_CATEGORIES,
} from "@/lib/fiscal-categories";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type ObligationRow = typeof taxObligations.$inferSelect;

export type CuFiscalSettings = {
  regime?: string;
  nit?: string;
  monthlyPayrollCents?: string; // bigint serializado
  fixedQuotaCents?: string;
  minExemptCents?: string;
};

export async function getFiscalSettings(
  db: Db,
  orgId: string,
): Promise<{ country: string | null; settings: CuFiscalSettings }> {
  const [row] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId));
  return {
    country: row?.fiscalCountry ?? null,
    settings: (row?.fiscalSettings as CuFiscalSettings) ?? {},
  };
}

export async function saveFiscalSettings(
  db: Db,
  orgId: string,
  userId: UserId,
  country: string,
  settings: CuFiscalSettings,
): Promise<void> {
  await db
    .update(orgSettings)
    .set({
      fiscalCountry: country,
      fiscalSettings: settings,
      updatedAt: new Date(),
    })
    .where(eq(orgSettings.orgId, orgId));
  await logAudit(db, {
    orgId,
    userId,
    entity: "fiscal_settings",
    entityId: orgId,
    action: "update",
    after: { country, regime: settings.regime },
  });
}

/** Ventas confirmadas del período en moneda base (la base imponible). */
async function salesBaseOfPeriod(
  db: Db,
  orgId: string,
  from: Date,
  to: Date,
): Promise<bigint> {
  const rows = await db
    .select({ total: sales.totalBaseCents })
    .from(sales)
    .where(
      and(
        eq(sales.orgId, orgId),
        eq(sales.status, "confirmed"),
        gte(sales.soldAt, from),
        lt(sales.soldAt, to),
      ),
    );
  return rows.reduce((acc: bigint, r: { total: bigint }) => acc + r.total, 0n);
}

// ─────────────── Paridad ERP: base imponible desde el BANCO ───────────────
// TaxEngine.js del ERP: "Fuentes de ingresos (en orden de prioridad):
// 1. consolidado_bancario  2. movimientos_cuenta" — la tabla `ventas` NUNCA
// alimenta el cálculo real (solo el análisis de brecha, más abajo).

export type IncomeSource =
  "consolidado_ventas" | "consolidado_bancario" | "movimientos_cuenta" | "none";
export type IncomeConfidence = "alta" | "media" | "baja" | "sin_datos";
export type IncomeSourceDetail = {
  totalCents: bigint;
  source: IncomeSource;
  confidence: IncomeConfidence;
};

async function sumConsolidated(
  db: Db,
  orgId: string,
  year: number,
  month: number | undefined,
  categoriaFilter: ReturnType<typeof sql> | undefined,
): Promise<bigint> {
  const monthClause = month ? sql`and c.mes = ${month}` : sql``;
  const res = await db.execute(sql`
    select coalesce(sum(c.importe), 0)::text as total
    from consolidated_entries c
    where c.org_id = ${orgId} and c.anio = ${year} and c.tipo_transaccion = 'CR'
      ${monthClause} ${categoriaFilter ?? sql``}
  `);
  const rows = (res.rows ?? res) as Array<{ total: string }>;
  return parseDecimalToCents(rows[0]?.total ?? "0");
}

async function sumStatementMovements(
  db: Db,
  orgId: string,
  year: number,
  month: number | undefined,
): Promise<bigint> {
  const filters = [
    eq(statementMovements.orgId, orgId),
    eq(statementMovements.anio, year),
    eq(statementMovements.operacion, "CR"),
  ];
  if (month) filters.push(eq(statementMovements.mes, month));
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${statementMovements.importe}), 0)::text`,
    })
    .from(statementMovements)
    .where(and(...filters));
  return parseDecimalToCents(rows[0]?.total ?? "0");
}

/**
 * ≈ getIncomeSourceDetail del ERP: cascada de 3 niveles de confianza.
 * 1 (alta): consolidado filtrado por categorías de venta reales.
 * 2 (media): consolidado, todos los CR salvo los no-operativos (préstamos,
 *    transferencias internas, aportes de capital...).
 * 3 (baja): estados de cuenta crudos (BPA sin conciliar/categorizar).
 */
export async function incomeSourceDetail(
  db: Db,
  orgId: string,
  year: number,
  month?: number,
): Promise<IncomeSourceDetail> {
  const salesCategoriaIn = sql`and c.categoria in (${sql.join(
    SALES_CATEGORIES.map((c) => sql`${c}`),
    sql`, `,
  )})`;
  const tier1 = await sumConsolidated(db, orgId, year, month, salesCategoriaIn);
  if (tier1 > 0n) {
    return {
      totalCents: tier1,
      source: "consolidado_ventas",
      confidence: "alta",
    };
  }

  const nonOperatingNotIn = sql`and (c.categoria is null or c.categoria not in (${sql.join(
    NON_OPERATING_INCOME_CATEGORIES.map((c) => sql`${c}`),
    sql`, `,
  )}))`;
  const tier2 = await sumConsolidated(
    db,
    orgId,
    year,
    month,
    nonOperatingNotIn,
  );
  if (tier2 > 0n) {
    return {
      totalCents: tier2,
      source: "consolidado_bancario",
      confidence: "media",
    };
  }

  const tier3 = await sumStatementMovements(db, orgId, year, month);
  if (tier3 > 0n) {
    return {
      totalCents: tier3,
      source: "movimientos_cuenta",
      confidence: "baja",
    };
  }
  return { totalCents: 0n, source: "none", confidence: "sin_datos" };
}

/**
 * ≈ getMonthlyDeductibleExpenses/getAnnualDeductibleExpenses del ERP: 100%
 * banco (consolidado, tipo DB, categorías deducibles) — NO desde compras.
 */
export async function deductibleExpensesFromBank(
  db: Db,
  orgId: string,
  year: number,
  month?: number,
): Promise<bigint> {
  const monthClause = month ? sql`and c.mes = ${month}` : sql``;
  const categoriaIn = sql`and c.categoria in (${sql.join(
    DEDUCTIBLE_EXPENSE_CATEGORIES.map((c) => sql`${c}`),
    sql`, `,
  )})`;
  const res = await db.execute(sql`
    select coalesce(sum(c.importe), 0)::text as total
    from consolidated_entries c
    where c.org_id = ${orgId} and c.anio = ${year} and c.tipo_transaccion = 'DB'
      ${monthClause} ${categoriaIn}
  `);
  const rows = (res.rows ?? res) as Array<{ total: string }>;
  return parseDecimalToCents(rows[0]?.total ?? "0");
}

export type GapMonth = {
  mes: number;
  anio: number;
  ventasInternasCents: bigint;
  ingresosBancariosCents: bigint;
  brechaCents: bigint;
  porcentajeBancarizado: number | null;
};

/**
 * ≈ getGapAnalysis del ERP: ventas internas (no canceladas) vs TODOS los CR
 * del banco (sin categorizar), mes a mes. Herramienta de TRANSPARENCIA para
 * el operador — NO altera la base declarada (esa sale de incomeSourceDetail).
 * Literal del ERP: "dinero que se vendió pero NO aparece en el banco —
 * típicamente efectivo retenido fuera del sistema bancario".
 */
export async function gapAnalysis(
  db: Db,
  orgId: string,
  year: number,
): Promise<{ months: GapMonth[]; totals: GapMonth }> {
  const months: GapMonth[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const from = new Date(Date.UTC(year, mes - 1, 1));
    const to = new Date(Date.UTC(year, mes, 1));
    const ventasInternasCents = await salesBaseOfPeriod(db, orgId, from, to);
    const ingresosBancariosCents = await sumConsolidated(
      db,
      orgId,
      year,
      mes,
      undefined,
    );
    const brechaCents = ventasInternasCents - ingresosBancariosCents;
    const porcentajeBancarizado =
      ventasInternasCents > 0n
        ? Number((ingresosBancariosCents * 10000n) / ventasInternasCents) / 100
        : null;
    months.push({
      mes,
      anio: year,
      ventasInternasCents,
      ingresosBancariosCents,
      brechaCents,
      porcentajeBancarizado,
    });
  }
  const totals = months.reduce(
    (acc, m) => ({
      mes: 0,
      anio: year,
      ventasInternasCents: acc.ventasInternasCents + m.ventasInternasCents,
      ingresosBancariosCents:
        acc.ingresosBancariosCents + m.ingresosBancariosCents,
      brechaCents: acc.brechaCents + m.brechaCents,
      porcentajeBancarizado: null,
    }),
    {
      mes: 0,
      anio: year,
      ventasInternasCents: 0n,
      ingresosBancariosCents: 0n,
      brechaCents: 0n,
      porcentajeBancarizado: null as number | null,
    },
  );
  totals.porcentajeBancarizado =
    totals.ventasInternasCents > 0n
      ? Number(
          (totals.ingresosBancariosCents * 10000n) / totals.ventasInternasCents,
        ) / 100
      : null;
  return { months, totals };
}

/**
 * Calcula/recalcula las obligaciones del mes con el motor del país.
 * Las pendientes se reemplazan; las ya pagadas no se tocan.
 */
export async function computeMonthObligations(
  db: Db,
  orgId: string,
  userId: UserId,
  year: number,
  month: number,
): Promise<ObligationRow[]> {
  const { country, settings } = await getFiscalSettings(db, orgId);
  const engine = getFiscalEngine(country);
  if (!engine) {
    throw new Error("Configura el país fiscal primero (CU disponible)");
  }
  const income = await incomeSourceDetail(db, orgId, year, month);
  const salesBase = income.totalCents;

  // nómina: empleados activos primero; si no hay, el valor manual de settings
  const { activePayrollCents } = await import("@/features/people/queries");
  const employeePayroll = await activePayrollCents(db, orgId);
  const payrollCents =
    employeePayroll > 0n
      ? employeePayroll
      : BigInt(settings.monthlyPayrollCents ?? "0");

  const lines = engine.monthlyObligations({
    regime: settings.regime ?? "TCP_GENERAL",
    salesBaseCents: salesBase,
    payrollCents,
    fixedQuotaCents: BigInt(settings.fixedQuotaCents ?? "0"),
  });

  return db.transaction(async (tx: Db) => {
    const existing: ObligationRow[] = await tx
      .select()
      .from(taxObligations)
      .where(
        and(
          eq(taxObligations.orgId, orgId),
          eq(taxObligations.year, year),
          eq(taxObligations.month, month),
        ),
      );
    const paidCodes = new Set(
      existing.filter((o) => o.status === "paid").map((o) => o.conceptCode),
    );
    // borra pendientes y reinserta con el cálculo fresco
    for (const o of existing) {
      if (o.status === "pending") {
        await tx.delete(taxObligations).where(eq(taxObligations.id, o.id));
      }
    }
    for (const l of lines) {
      if (paidCodes.has(l.code)) continue;
      await tx.insert(taxObligations).values({
        orgId,
        year,
        month,
        conceptCode: l.code,
        name: l.name,
        baseCents: l.baseCents,
        amountCents: l.amountCents,
      });
    }
    await logAudit(tx, {
      orgId,
      userId,
      entity: "tax_obligations",
      entityId: `${year}-${month}`,
      action: "update",
      after: { computed: lines.length },
    });
    return tx
      .select()
      .from(taxObligations)
      .where(
        and(
          eq(taxObligations.orgId, orgId),
          eq(taxObligations.year, year),
          eq(taxObligations.month, month),
        ),
      );
  });
}

export async function listMonthObligations(
  db: Db,
  orgId: string,
  year: number,
  month: number,
): Promise<ObligationRow[]> {
  return db
    .select()
    .from(taxObligations)
    .where(
      and(
        eq(taxObligations.orgId, orgId),
        eq(taxObligations.year, year),
        eq(taxObligations.month, month),
      ),
    )
    .orderBy(taxObligations.conceptCode);
}

export async function markObligationPaid(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<ObligationRow> {
  const [row] = await db
    .select()
    .from(taxObligations)
    .where(eq(taxObligations.id, id));
  assertOwnedByOrg(row, orgId);
  const [updated] = await db
    .update(taxObligations)
    .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(eq(taxObligations.id, id))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "tax_obligation",
    entityId: id,
    action: "update",
    after: { status: "paid" },
  });
  return updated;
}

/** Proyección DJ-08 del año: YTD real de ventas y compras deducibles. */
export async function dj08Projection(
  db: Db,
  orgId: string,
  year: number,
): Promise<
  AnnualProjection & {
    incomeCents: bigint;
    deductibleCents: bigint;
    incomeSource: IncomeSource;
    incomeConfidence: IncomeConfidence;
  }
> {
  const { country, settings } = await getFiscalSettings(db, orgId);
  const engine = getFiscalEngine(country);
  if (!engine) {
    throw new Error("Configura el país fiscal primero (CU disponible)");
  }
  const income = await incomeSourceDetail(db, orgId, year);
  const incomeCents = income.totalCents;
  const deductibleCents = await deductibleExpensesFromBank(db, orgId, year);
  const advances: ObligationRow[] = await db
    .select()
    .from(taxObligations)
    .where(
      and(
        eq(taxObligations.orgId, orgId),
        eq(taxObligations.year, year),
        eq(taxObligations.conceptCode, "051012"),
        eq(taxObligations.status, "paid"),
      ),
    );
  const advancesPaidCents = advances.reduce(
    (acc, a) => acc + a.amountCents,
    0n,
  );
  const projection = engine.annualProjection({
    incomeCents,
    deductibleExpensesCents: deductibleCents,
    advancesPaidCents,
    minExemptCents: BigInt(settings.minExemptCents ?? "0"),
  });
  return {
    ...projection,
    incomeCents,
    deductibleCents,
    incomeSource: income.source,
    incomeConfidence: income.confidence,
  };
}
