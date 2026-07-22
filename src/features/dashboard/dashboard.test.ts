// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings, pipelineStages } from "@/db/schema";
import { DEFAULT_STAGES } from "@/lib/auth";
import { createCustomer } from "@/features/customers/queries";
import { createProduct, registerMovement } from "@/features/inventory/queries";
import { createSale, confirmSale, addPayment } from "@/features/sales/queries";
import { createDeal } from "@/features/pipeline/queries";
import { getDashboard } from "./queries";

let db: TestDb;
let orgA: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "m9a" })
    .returning();
  orgA = a.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });
  await db
    .insert(pipelineStages)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId: orgA })));

  const customer = await createCustomer(db, orgA, USER, { name: "C1" });
  const product = await createProduct(db, orgA, USER, {
    name: "P1",
    unit: "unit",
    stockMin: "50",
  });
  await registerMovement(db, orgA, USER, {
    productId: product.id,
    kind: "in",
    qty: "40", // bajo mínimo (50)
    unitCostCents: 100n,
  });

  // venta USD 25.00 @320 → 8000.00 CUP, cobrada 10.00
  const s1 = await createSale(db, orgA, USER, {
    customerId: customer.id,
    currency: "USD",
    rateToBase: "320",
    idempotencyKey: "99999999-9999-4999-8999-999999999991",
    items: [{ description: "d", qty: "1", unitPriceCents: 2500n }],
  });
  await confirmSale(db, orgA, USER, s1.id);
  await addPayment(db, orgA, USER, s1.id, {
    amountCents: 1000n,
    currency: "USD",
    rateFixed: "1",
    appliedCents: 1000n,
  });
  // venta CUP 500.00 sin cobrar
  const s2 = await createSale(db, orgA, USER, {
    customerId: customer.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "99999999-9999-4999-8999-999999999992",
    items: [{ description: "d", qty: "1", unitPriceCents: 50000n }],
  });
  await confirmSale(db, orgA, USER, s2.id);

  await createDeal(db, orgA, USER, {
    customerId: customer.id,
    title: "Abierto",
    amountCents: 10000n,
    currency: "CUP",
  });
});

describe("dashboard", () => {
  it("agrega ventas del mes por moneda y consolidado a tasas fijadas", async () => {
    const d = await getDashboard(db, orgA);
    const usd = d.salesByCurrency.find((s) => s.currency === "USD");
    const cup = d.salesByCurrency.find((s) => s.currency === "CUP");
    expect(usd?.totalCents).toBe(2500n);
    expect(cup?.totalCents).toBe(50000n);
    // consolidado: 25×320 + 500 = 8500.00 CUP
    expect(d.monthTotalBaseCents).toBe(850000n);
  });

  it("CxC: saldos pendientes por moneda", async () => {
    const d = await getDashboard(db, orgA);
    expect(d.receivables).toHaveLength(2);
    const usd = d.receivables.find((r) => r.currency === "USD");
    expect(usd?.balanceCents).toBe(1500n); // 25 - 10
  });

  it("embudo: cuenta deals por etapa", async () => {
    const d = await getDashboard(db, orgA);
    const first = d.funnel[0];
    expect(first.stageName).toBe("Prospecto");
    expect(first.count).toBe(1);
  });

  it("alerta de stock bajo mínimo", async () => {
    const d = await getDashboard(db, orgA);
    expect(d.lowStockCount).toBe(1);
  });
});
