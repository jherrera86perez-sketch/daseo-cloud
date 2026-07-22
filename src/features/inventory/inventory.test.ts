// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations } from "@/db/schema";
import {
  createProduct,
  listProducts,
  registerMovement,
  getStock,
  listMovements,
  lowStockProducts,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "m4a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "m4b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
});

describe("productos", () => {
  it("crea y lista con flags y unidad", async () => {
    const p = await createProduct(db, orgA, USER, {
      name: "SLES 70%",
      unit: "kg",
      isComponent: true,
      isSellable: false,
      stockMin: "100",
    });
    expect(p.unit).toBe("kg");
    const list = await listProducts(db, orgA, {});
    expect(list.map((x) => x.name)).toEqual(["SLES 70%"]);
  });
});

describe("kardex: costo promedio ponderado en moneda base", () => {
  let productId: string;

  it("entrada inicial fija saldo y costo", async () => {
    const p = await createProduct(db, orgA, USER, {
      name: "Detergente Fregar",
      unit: "L",
      isProducible: true,
    });
    productId = p.id;
    await registerMovement(db, orgA, USER, {
      productId,
      kind: "in",
      qty: "100",
      unitCostCents: 5000n, // 50.00 base por unidad
    });
    const stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(100_000n);
    expect(stock.avgCostCents).toBe(5000n);
  });

  it("segunda entrada a costo distinto promedia (100@50 + 100@100 → 75)", async () => {
    await registerMovement(db, orgA, USER, {
      productId,
      kind: "in",
      qty: "100",
      unitCostCents: 10000n,
    });
    const stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(200_000n);
    expect(stock.avgCostCents).toBe(7500n);
  });

  it("salida descuenta al costo promedio sin cambiarlo", async () => {
    await registerMovement(db, orgA, USER, {
      productId,
      kind: "out",
      qty: "50",
    });
    const stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(150_000n);
    expect(stock.avgCostCents).toBe(7500n);
    const moves = await listMovements(db, orgA, productId);
    expect(moves[0].unitCostBaseCents).toBe(7500n); // la salida se valora al promedio
  });

  it("prohíbe stock negativo con error claro", async () => {
    await expect(
      registerMovement(db, orgA, USER, {
        productId,
        kind: "out",
        qty: "999",
      }),
    ).rejects.toThrow(/stock/i);
  });

  it("ajuste de salida valorado al promedio", async () => {
    await registerMovement(db, orgA, USER, {
      productId,
      kind: "adjust_out",
      qty: "10",
      note: "merma detectada",
    });
    const stock = await getStock(db, orgA, productId);
    expect(stock.qtyMilli).toBe(140_000n);
  });

  it("TEST DE ORO: valor del saldo == Σ entradas − Σ salidas (a sus costos)", async () => {
    const moves = await listMovements(db, orgA, productId);
    let value = 0n;
    for (const m of moves) {
      const qty = BigInt(Math.round(Number(m.qty) * 1000));
      value += (qty * (m.unitCostBaseCents ?? 0n)) / 1000n;
    }
    const stock = await getStock(db, orgA, productId);
    const balanceValue = (stock.qtyMilli * stock.avgCostCents) / 1000n;
    const diff = value - balanceValue;
    const absDiff = diff < 0n ? -diff : diff;
    // tolerancia: 1 centavo por movimiento (redondeo half-up)
    expect(absDiff <= BigInt(moves.length)).toBe(true);
  });

  it("aislamiento: otra org no puede mover el producto", async () => {
    await expect(
      registerMovement(db, orgB, USER, {
        productId,
        kind: "out",
        qty: "1",
      }),
    ).rejects.toThrow();
  });
});

describe("alertas de stock mínimo", () => {
  it("lista productos bajo el mínimo", async () => {
    const p = await createProduct(db, orgA, USER, {
      name: "Envases 1L",
      unit: "unit",
      stockMin: "500",
    });
    await registerMovement(db, orgA, USER, {
      productId: p.id,
      kind: "in",
      qty: "100",
      unitCostCents: 10n,
    });
    const low = await lowStockProducts(db, orgA);
    expect(low.map((x) => x.name)).toContain("Envases 1L");
    expect(low.map((x) => x.name)).not.toContain("Detergente Fregar");
  });
});
