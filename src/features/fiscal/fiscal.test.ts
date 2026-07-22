// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale } from "@/features/sales/queries";
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

  // venta confirmada de 100,000.00 CUP este mes
  const c = await createCustomer(db, orgA, USER, { name: "Cliente F4" });
  const s = await createSale(db, orgA, USER, {
    customerId: c.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "f4f4f4f4-0000-4000-8000-000000000001",
    items: [{ description: "d", qty: "1", unitPriceCents: 10_000_000n }],
  });
  await confirmSale(db, orgA, USER, s.id);
});

describe("obligaciones ONAT del mes", () => {
  it("calcula desde las ventas confirmadas reales", async () => {
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
