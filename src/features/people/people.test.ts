// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale } from "@/features/sales/queries";
import {
  saveFiscalSettings,
  computeMonthObligations,
} from "@/features/fiscal/queries";
import {
  createEmployee,
  listEmployees,
  updateEmployee,
  softDeleteEmployee,
  activePayrollCents,
  createCommitment,
  listCommitmentsWithStatus,
  topCustomers,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let customerId: string;
const USER = null;
const now = new Date();

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f5a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "f5b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });
  const c = await createCustomer(db, orgA, USER, { name: "J-Carlos" });
  customerId = c.id;
});

describe("empleados y nómina", () => {
  it("CRUD y suma de nómina activa", async () => {
    const e1 = await createEmployee(db, orgA, USER, {
      name: "Obrero 1",
      salaryCents: 500_000n, // 5,000.00
    });
    await createEmployee(db, orgA, USER, {
      name: "Obrero 2",
      salaryCents: 700_000n,
    });
    expect(await activePayrollCents(db, orgA)).toBe(1_200_000n);

    await updateEmployee(db, orgA, USER, e1.id, {
      name: "Obrero 1",
      salaryCents: 500_000n,
      active: "no",
    });
    expect(await activePayrollCents(db, orgA)).toBe(700_000n);

    await softDeleteEmployee(db, orgA, USER, e1.id);
    const list = await listEmployees(db, orgA);
    expect(list.map((x) => x.name)).toEqual(["Obrero 2"]);
  });

  it("la nómina de empleados alimenta las obligaciones fiscales", async () => {
    await saveFiscalSettings(db, orgA, USER, "CU", { regime: "TCP_GENERAL" });
    const rows = await computeMonthObligations(
      db,
      orgA,
      USER,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
    const ss = rows.find((r) => r.conceptCode === "031012");
    // 12.5% de 7,000.00 (empleado activo) = 875.00
    expect(ss?.amountCents).toBe(87_500n);
  });
});

describe("compromisos de cliente (J-Carlos)", () => {
  it("compromiso semanal sin venta esta semana = incumplido", async () => {
    await createCommitment(db, orgA, USER, {
      customerId,
      description: "20 L de detergente semanales",
      frequency: "weekly",
    });
    const list = await listCommitmentsWithStatus(db, orgA);
    expect(list).toHaveLength(1);
    expect(list[0].fulfilled).toBe(false);
    expect(list[0].customerName).toBe("J-Carlos");
  });

  it("una venta confirmada en el período lo marca cumplido", async () => {
    const s = await createSale(db, orgA, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: "f5f5f5f5-0000-4000-8000-000000000001",
      items: [{ description: "detergente", qty: "20", unitPriceCents: 10000n }],
    });
    await confirmSale(db, orgA, USER, s.id);
    const list = await listCommitmentsWithStatus(db, orgA);
    expect(list[0].fulfilled).toBe(true);
  });
});

describe("top clientes", () => {
  it("ranquea por ventas confirmadas en base", async () => {
    const top = await topCustomers(db, orgA, 5);
    expect(top[0].name).toBe("J-Carlos");
    expect(top[0].totalBaseCents).toBe(200_000n); // 20 × 100.00
    // aislamiento
    const topB = await topCustomers(db, orgB, 5);
    expect(topB).toHaveLength(0);
  });
});
