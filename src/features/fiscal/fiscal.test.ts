// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings, consolidatedEntries } from "@/db/schema";
import {
  saveFiscalSettings,
  computeMonthObligations,
  markObligationPaid,
  dj08Projection,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;
const now = new Date();
const YEAR = now.getUTCFullYear();
const MONTH = now.getUTCMonth() + 1;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f4a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "f4b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });
  await saveFiscalSettings(db, orgA, USER, "CU", {
    regime: "TCP_GENERAL",
    monthlyPayrollCents: "0",
  });

  // Paridad ERP: la base imponible sale del BANCO (consolidado), no de las
  // ventas — un ingreso de 100,000.00 CUP categorizado como venta real
  // (tier 1 / confianza "alta" de incomeSourceDetail).
  await db.insert(consolidatedEntries).values({
    orgId: orgA,
    fechaContable: `${YEAR}-${String(MONTH).padStart(2, "0")}-15`,
    dia: 15,
    mes: MONTH,
    anio: YEAR,
    tipoTransaccion: "CR",
    importe: "100000.00",
    categoria: "Ventas Minoristas",
    origen: "manual",
  });
});

describe("obligaciones ONAT del mes", () => {
  it("calcula desde el consolidado bancario real (paridad ERP)", async () => {
    const rows = await computeMonthObligations(db, orgA, USER, YEAR, MONTH);
    const ventas = rows.find((r) => r.conceptCode === "011402");
    expect(ventas?.amountCents).toBe(1_000_000n); // 10% de 100,000
    expect(ventas?.baseCents).toBe(10_000_000n);
    const anticipo = rows.find((r) => r.conceptCode === "051012");
    expect(anticipo?.amountCents).toBe(500_000n); // 5%
  });

  it("recalcular no toca las pagadas", async () => {
    const rows = await computeMonthObligations(db, orgA, USER, YEAR, MONTH);
    const anticipo = rows.find((r) => r.conceptCode === "051012")!;
    await markObligationPaid(db, orgA, USER, anticipo.id);
    const again = await computeMonthObligations(db, orgA, USER, YEAR, MONTH);
    const anticipoAgain = again.find((r) => r.conceptCode === "051012")!;
    expect(anticipoAgain.id).toBe(anticipo.id);
    expect(anticipoAgain.status).toBe("paid");
  });

  it("aislamiento: otra org no marca pagos ajenos", async () => {
    const rows = await computeMonthObligations(db, orgA, USER, YEAR, MONTH);
    await expect(
      markObligationPaid(db, orgB, USER, rows[0].id),
    ).rejects.toThrow();
  });
});

describe("proyección DJ-08", () => {
  it("usa ingresos YTD y descuenta los pagos a cuenta pagados", async () => {
    const p = await dj08Projection(db, orgA, YEAR);
    expect(p.incomeCents).toBe(10_000_000n);
    expect(p.taxCents).toBeGreaterThan(0n);
    // el anticipo pagado (5,000.00) reduce el saldo
    expect(p.balanceCents).toBe(p.taxCents - 500_000n);
  });
});
