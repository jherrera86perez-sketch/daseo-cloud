// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createProduct, getStock } from "@/features/inventory/queries";
import {
  createSupplier,
  listSuppliers,
  createPurchase,
  confirmPurchase,
  cancelPurchase,
  getPurchaseDetail,
  addSupplierPayment,
  accountsPayable,
  listLots,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let supplierId: string;
let slesId: string;
let purchaseId: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f2a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "f2b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });
  slesId = (
    await createProduct(db, orgA, USER, {
      name: "SLES 70%",
      unit: "kg",
      isComponent: true,
    })
  ).id;
});

describe("proveedores", () => {
  it("crea y lista", async () => {
    const s = await createSupplier(db, orgA, USER, {
      name: "Química Habana",
      phone: "+53 7777",
    });
    supplierId = s.id;
    const list = await listSuppliers(db, orgA, {});
    expect(list.map((x) => x.name)).toEqual(["Química Habana"]);
  });
});

describe("compras multi-moneda con lotes", () => {
  it("borrador con totales en servidor e idempotencia", async () => {
    const p = await createPurchase(db, orgA, USER, {
      supplierId,
      currency: "USD",
      rateToBase: "320",
      idempotencyKey: "f2f2f2f2-0000-4000-8000-000000000001",
      items: [
        {
          productId: slesId,
          description: "SLES 70% IBC",
          qty: "1000",
          unitCostCents: 150n, // 1.50 USD/kg
          lotCode: "IBC-2026-07",
          expiryDate: "2027-07-01",
        },
        { description: "Flete marítimo", qty: "1", unitCostCents: 20000n }, // 200 USD
      ],
    });
    purchaseId = p.id;
    expect(p.status).toBe("draft");
    expect(p.totalCents).toBe(170000n); // 1500 + 200 USD
    expect(p.totalBaseCents).toBe(54400000n); // 1700 × 320 CUP

    const again = await createPurchase(db, orgA, USER, {
      supplierId,
      currency: "USD",
      rateToBase: "320",
      idempotencyKey: "f2f2f2f2-0000-4000-8000-000000000001",
      items: [{ description: "x", qty: "1", unitCostCents: 1n }],
    });
    expect(again.id).toBe(purchaseId);
  });

  it("confirmar numera, entra stock AL COSTO EN BASE y crea el lote", async () => {
    const confirmed = await confirmPurchase(db, orgA, USER, purchaseId);
    expect(confirmed.number).toBe(1);
    const stock = await getStock(db, orgA, slesId);
    expect(stock.qtyMilli).toBe(1_000_000n); // 1000 kg
    // 1.50 USD × 320 = 480.00 CUP/kg
    expect(stock.avgCostCents).toBe(48000n);

    const lots = await listLots(db, orgA, slesId);
    expect(lots).toHaveLength(1);
    expect(lots[0].code).toBe("IBC-2026-07");
    expect(String(lots[0].expiryDate)).toContain("2027-07-01");
  });

  it("no se confirma dos veces y otra org no la ve", async () => {
    await expect(confirmPurchase(db, orgA, USER, purchaseId)).rejects.toThrow();
    await expect(getPurchaseDetail(db, orgB, purchaseId)).rejects.toThrow();
  });

  it("cancelar una confirmada revierte el stock con contramovimiento", async () => {
    const p2 = await createPurchase(db, orgA, USER, {
      supplierId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: "f2f2f2f2-0000-4000-8000-000000000002",
      items: [
        {
          productId: slesId,
          description: "saco",
          qty: "50",
          unitCostCents: 40000n,
        },
      ],
    });
    await confirmPurchase(db, orgA, USER, p2.id);
    let stock = await getStock(db, orgA, slesId);
    expect(stock.qtyMilli).toBe(1_050_000n);
    await cancelPurchase(db, orgA, USER, p2.id);
    stock = await getStock(db, orgA, slesId);
    expect(stock.qtyMilli).toBe(1_000_000n);
  });
});

describe("cuentas por pagar", () => {
  it("pago parcial en moneda cruzada reduce el saldo", async () => {
    // compra 1: 1700 USD. Pago: 160000 CUP = 500 USD
    await addSupplierPayment(db, orgA, USER, purchaseId, {
      amountCents: 16000000n,
      currency: "CUP",
      rateFixed: "320",
      appliedCents: 50000n,
    });
    const detail = await getPurchaseDetail(db, orgA, purchaseId);
    expect(detail.balanceCents).toBe(120000n); // 1700 - 500 USD

    const ap = await accountsPayable(db, orgA);
    const row = ap.find((r) => r.id === purchaseId);
    expect(row?.balanceCents).toBe(120000n);
  });

  it("rechaza pagos que exceden el saldo", async () => {
    await expect(
      addSupplierPayment(db, orgA, USER, purchaseId, {
        amountCents: 99999999n,
        currency: "USD",
        rateFixed: "1",
        appliedCents: 99999999n,
      }),
    ).rejects.toThrow(/saldo/i);
  });
});
