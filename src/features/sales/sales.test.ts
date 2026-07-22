// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import {
  createProduct,
  registerMovement,
  getStock,
} from "@/features/inventory/queries";
import { addRate, getCurrentRate, listRates } from "@/features/rates/queries";
import {
  createSale,
  confirmSale,
  cancelSale,
  addPayment,
  getSaleDetail,
  accountsReceivable,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let productId: string;
let customerId: string;
let saleId: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "m5a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "m5b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });

  const { createCustomer } = await import("@/features/customers/queries");
  const c = await createCustomer(db, orgA, USER, { name: "Cliente M5" });
  customerId = c.id;
  const p = await createProduct(db, orgA, USER, {
    name: "Detergente 1L",
    unit: "L",
  });
  productId = p.id;
  await registerMovement(db, orgA, USER, {
    productId,
    kind: "in",
    qty: "100",
    unitCostCents: 5000n, // 50.00 CUP
  });
});

describe("tasas de cambio", () => {
  it("registra tasas append-only y devuelve la vigente", async () => {
    await addRate(db, orgA, USER, { currency: "USD", rateToBase: "300" });
    await addRate(db, orgA, USER, { currency: "USD", rateToBase: "320" });
    const current = await getCurrentRate(db, orgA, "USD");
    expect(current?.rateToBase).toBe("320.000000");
    const all = await listRates(db, orgA);
    expect(all.length).toBe(2);
  });
});

describe("ventas multi-moneda", () => {
  it("crea borrador con totales calculados en servidor (una conversión por documento)", async () => {
    const sale = await createSale(db, orgA, USER, {
      customerId,
      currency: "USD",
      rateToBase: "320",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      items: [
        {
          productId,
          description: "Detergente 1L",
          qty: "10",
          unitPriceCents: 200n,
        }, // 2.00 USD
        { description: "Flete", qty: "1", unitPriceCents: 500n }, // 5.00 USD sin producto
      ],
    });
    saleId = sale.id;
    expect(sale.status).toBe("draft");
    expect(sale.totalCents).toBe(2500n); // 20 + 5 USD
    expect(sale.totalBaseCents).toBe(800000n); // 25 USD * 320 = 8000.00 CUP
  });

  it("idempotencia: el mismo key no duplica la venta", async () => {
    const again = await createSale(db, orgA, USER, {
      customerId,
      currency: "USD",
      rateToBase: "320",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      items: [{ description: "x", qty: "1", unitPriceCents: 1n }],
    });
    expect(again.id).toBe(saleId);
  });

  it("confirmar asigna número secuencial y descuenta stock", async () => {
    const confirmed = await confirmSale(db, orgA, USER, saleId);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.number).toBe(1);
    const stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(90_000n);
  });

  it("una segunda venta toma el número 2", async () => {
    const s2 = await createSale(db, orgA, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      items: [
        { productId, description: "d", qty: "5", unitPriceCents: 70000n },
      ],
    });
    const c2 = await confirmSale(db, orgA, USER, s2.id);
    expect(c2.number).toBe(2);
  });

  it("confirmar sin stock suficiente aborta TODO (no descuenta parcial)", async () => {
    const s3 = await createSale(db, orgA, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      items: [{ productId, description: "d", qty: "9999", unitPriceCents: 1n }],
    });
    await expect(confirmSale(db, orgA, USER, s3.id)).rejects.toThrow(/stock/i);
    const stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(85_000n); // 90 - 5 de la venta 2, intacto
  });

  it("cancelar una venta confirmada repone el stock con contramovimiento", async () => {
    const s4 = await createSale(db, orgA, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      items: [{ productId, description: "d", qty: "10", unitPriceCents: 100n }],
    });
    await confirmSale(db, orgA, USER, s4.id);
    let stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(75_000n);
    await cancelSale(db, orgA, USER, s4.id);
    stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(85_000n);
    const detail = await getSaleDetail(db, orgA, s4.id);
    expect(detail.sale.status).toBe("cancelled");
  });

  it("aislamiento: otra org no ve ni confirma la venta", async () => {
    await expect(getSaleDetail(db, orgB, saleId)).rejects.toThrow();
    await expect(confirmSale(db, orgB, USER, saleId)).rejects.toThrow();
  });
});

describe("cobros (pagos parciales y moneda cruzada)", () => {
  it("pago parcial en la misma moneda reduce el saldo", async () => {
    // venta 1: 25.00 USD
    await addPayment(db, orgA, USER, saleId, {
      amountCents: 1000n,
      currency: "USD",
      rateFixed: "1",
      appliedCents: 1000n,
    });
    const detail = await getSaleDetail(db, orgA, saleId);
    expect(detail.balanceCents).toBe(1500n); // 25 - 10 USD
  });

  it("pago en CUP aplicado a venta en USD usa applied_cents confirmado", async () => {
    // cobra 3200.00 CUP que el usuario confirma como 10.00 USD
    await addPayment(db, orgA, USER, saleId, {
      amountCents: 320000n,
      currency: "CUP",
      rateFixed: "320",
      appliedCents: 1000n,
    });
    const detail = await getSaleDetail(db, orgA, saleId);
    expect(detail.balanceCents).toBe(500n); // quedan 5.00 USD
  });

  it("rechaza pagos que exceden el saldo", async () => {
    await expect(
      addPayment(db, orgA, USER, saleId, {
        amountCents: 99999n,
        currency: "USD",
        rateFixed: "1",
        appliedCents: 99999n,
      }),
    ).rejects.toThrow(/saldo/i);
  });

  it("cuentas por cobrar lista ventas confirmadas con saldo", async () => {
    const ar = await accountsReceivable(db, orgA);
    const row = ar.find((r) => r.id === saleId);
    expect(row).toBeTruthy();
    expect(row?.balanceCents).toBe(500n);
    expect(row?.currency).toBe("USD");
  });
});
