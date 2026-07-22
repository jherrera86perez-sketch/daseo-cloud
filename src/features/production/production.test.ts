// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import {
  createProduct,
  registerMovement,
  getStock,
} from "@/features/inventory/queries";
import { createRecipe } from "@/features/recipes/queries";
import {
  createOrder,
  confirmOrder,
  cancelOrder,
  getOrderDetail,
  listOrders,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let terminado: string;
let sles: string;
let sal: string;
let recipeId: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "m8a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "m8b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });

  terminado = (
    await createProduct(db, orgA, USER, {
      name: "Detergente",
      unit: "L",
      isProducible: true,
    })
  ).id;
  sles = (
    await createProduct(db, orgA, USER, {
      name: "SLES",
      unit: "kg",
      isComponent: true,
    })
  ).id;
  sal = (
    await createProduct(db, orgA, USER, {
      name: "Sal",
      unit: "kg",
      isComponent: true,
    })
  ).id;
  await registerMovement(db, orgA, USER, {
    productId: sles,
    kind: "in",
    qty: "100",
    unitCostCents: 5000n, // 50.00/kg
  });
  await registerMovement(db, orgA, USER, {
    productId: sal,
    kind: "in",
    qty: "100",
    unitCostCents: 1000n, // 10.00/kg
  });
  recipeId = (
    await createRecipe(db, orgA, USER, {
      productId: terminado,
      name: "Fórmula 100L",
      outputQty: "100",
      items: [
        { productId: sles, qty: "10" },
        { productId: sal, qty: "5" },
      ],
    })
  ).id;
});

describe("órdenes de producción", () => {
  let orderId: string;

  it("crear desde receta prellena los insumos planificados", async () => {
    const order = await createOrder(db, orgA, USER, { recipeId });
    orderId = order.id;
    const detail = await getOrderDetail(db, orgA, orderId);
    expect(detail.order.status).toBe("draft");
    expect(detail.inputs).toHaveLength(2);
    expect(detail.inputs.map((i) => i.plannedQty)).toEqual(["10.000", "5.000"]);
  });

  it("TEST DE ORO: confirmar consume insumos reales y el kardex del terminado vale insumos+labor+overhead", async () => {
    const detail = await getOrderDetail(db, orgA, orderId);
    const confirmed = await confirmOrder(db, orgA, USER, orderId, {
      producedQty: "98", // merma: rinde 98 en vez de 100
      laborCostBaseCents: 20000n, // 200.00 mano de obra
      overheadBaseCents: 10000n, // 100.00 indirectos
      inputs: detail.inputs.map((i) => ({
        inputId: i.id,
        actualQty: i.productId === sles ? "11" : "5", // merma de SLES: 11 en vez de 10
      })),
    });
    expect(confirmed.status).toBe("confirmed");

    // insumos descontados por lo REAL
    const stockSles = await getStock(db, orgA, sles);
    expect(stockSles.qtyMilli).toBe(89_000n); // 100 - 11
    const stockSal = await getStock(db, orgA, sal);
    expect(stockSal.qtyMilli).toBe(95_000n);

    // terminado: 98 L con costo real
    const stockTerm = await getStock(db, orgA, terminado);
    expect(stockTerm.qtyMilli).toBe(98_000n);

    // costo esperado: 11×50 + 5×10 + 200 + 100 = 550+50+300 = 900.00
    const balanceValue = (stockTerm.qtyMilli * stockTerm.avgCostCents) / 1000n;
    const expected = 90000n;
    const diff =
      balanceValue > expected
        ? balanceValue - expected
        : expected - balanceValue;
    expect(diff <= 100n).toBe(true); // tolerancia 1.00 por redondeo unitario
  });

  it("no se confirma dos veces", async () => {
    await expect(
      confirmOrder(db, orgA, USER, orderId, {
        producedQty: "1",
        laborCostBaseCents: 0n,
        overheadBaseCents: 0n,
        inputs: [],
      }),
    ).rejects.toThrow();
  });

  it("sin stock suficiente de un insumo, nada se aplica", async () => {
    const o2 = await createOrder(db, orgA, USER, { recipeId });
    const d2 = await getOrderDetail(db, orgA, o2.id);
    await expect(
      confirmOrder(db, orgA, USER, o2.id, {
        producedQty: "100",
        laborCostBaseCents: 0n,
        overheadBaseCents: 0n,
        inputs: d2.inputs.map((i) => ({
          inputId: i.id,
          actualQty: i.productId === sles ? "9999" : "5",
        })),
      }),
    ).rejects.toThrow(/stock/i);
    // sal intacta (no hubo descuento parcial)
    const stockSal = await getStock(db, orgA, sal);
    expect(stockSal.qtyMilli).toBe(95_000n);
  });

  it("cancelar un borrador y aislamiento entre orgs", async () => {
    const o3 = await createOrder(db, orgA, USER, { recipeId });
    const cancelled = await cancelOrder(db, orgA, USER, o3.id);
    expect(cancelled.status).toBe("cancelled");
    await expect(getOrderDetail(db, orgB, orderId)).rejects.toThrow();
    const list = await listOrders(db, orgA);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });
});
