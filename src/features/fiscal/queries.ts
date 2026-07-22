import { and, eq, gte, lt } from "drizzle-orm";
import { taxObligations, sales, purchases, orgSettings } from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { getFiscalEngine, type AnnualProjection } from "@/lib/fiscal";

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

async function purchasesBaseOfPeriod(
  db: Db,
  orgId: string,
  from: Date,
  to: Date,
): Promise<bigint> {
  const rows = await db
    .select({ total: purchases.totalBaseCents })
    .from(purchases)
    .where(
      and(
        eq(purchases.orgId, orgId),
        eq(purchases.status, "confirmed"),
        gte(purchases.receivedAt, from),
        lt(purchases.receivedAt, to),
      ),
    );
  return rows.reduce((acc: bigint, r: { total: bigint }) => acc + r.total, 0n);
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
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  const salesBase = await salesBaseOfPeriod(db, orgId, from, to);

  const lines = engine.monthlyObligations({
    regime: settings.regime ?? "TCP_GENERAL",
    salesBaseCents: salesBase,
    payrollCents: BigInt(settings.monthlyPayrollCents ?? "0"),
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
  AnnualProjection & { incomeCents: bigint; deductibleCents: bigint }
> {
  const { country, settings } = await getFiscalSettings(db, orgId);
  const engine = getFiscalEngine(country);
  if (!engine) {
    throw new Error("Configura el país fiscal primero (CU disponible)");
  }
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const incomeCents = await salesBaseOfPeriod(db, orgId, from, to);
  const deductibleCents = await purchasesBaseOfPeriod(db, orgId, from, to);
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
  return { ...projection, incomeCents, deductibleCents };
}
