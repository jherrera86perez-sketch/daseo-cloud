// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import {
  organizations,
  orgSettings,
  lots,
  products,
  productionInputs,
  inventoryMovements,
} from "@/db/schema";
import { createProduct, registerMovement } from "@/features/inventory/queries";
import { createRecipe } from "@/features/recipes/queries";
import { createOrder, confirmOrder } from "./queries";

let db: TestDb;
let orgId: string;
const USER = null;
let n = 0;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "ProdFiel", slug: "adprod" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
});

async function setupRecipe(opts: { price?: bigint; sellable?: boolean } = {}) {
  n += 1;
  const terminado = await createProduct(db, orgId, USER, {
    name: `Detergente-${n}`,
    unit: "L",
    isProducible: true,
    isSellable: opts.sellable ?? true,
    price: opts.price ? (Number(opts.price) / 100).toFixed(2) : undefined,
  });
  const insumo = await createProduct(db, orgId, USER, {
    name: `Sosa-${n}`,
    unit: "kg",
    isComponent: true,
  });
  await registerMovement(db, orgId, USER, {
    productId: insumo.id,
    kind: "in",
    qty: "100",
    unitCostCents: 10_00n,
  });
  const recipe = await createRecipe(db, orgId, USER, {
    productId: terminado.id,
    name: "R",
    outputQty: "10",
    items: [{ productId: insumo.id, qty: "10" }],
  });
  return { terminado, insumo, recipeId: recipe.id };
}

async function firstInput(orderId: string) {
  const [inp] = await db
    .select()
    .from(productionInputs)
    .where(eq(productionInputs.orderId, orderId));
  return inp;
}

describe("paridad producción — costos indirectos itemizados", () => {
  it("overheadItems reemplaza el monto manual: suma = overheadBaseCents", async () => {
    const { recipeId } = await setupRecipe();
    const order = await createOrder(db, orgId, USER, { recipeId });
    const inp = await firstInput(order.id);

    const confirmed = await confirmOrder(db, orgId, USER, order.id, {
      producedQty: "10",
      laborCostBaseCents: 0n,
      overheadBaseCents: 999_99n, // debe ser ignorado: overheadItems manda
      inputs: [{ inputId: inp.id, actualQty: "10" }],
      overheadItems: [
        { concept: "Electricidad", amountCents: 30_00n },
        { concept: "Empaques", amountCents: 20_00n },
      ],
    });
    expect(confirmed.overheadBaseCents).toBe(50_00n);
  });
});

describe("paridad producción — actualización de precio al confirmar (margen mantenido)", () => {
  it("sin margen previo (precio<=costo): aplica 30% por defecto", async () => {
    const { terminado, recipeId } = await setupRecipe({
      price: 0n,
      sellable: true,
    });
    const order = await createOrder(db, orgId, USER, { recipeId });
    const inp = await firstInput(order.id);
    await confirmOrder(db, orgId, USER, order.id, {
      producedQty: "10",
      laborCostBaseCents: 0n,
      overheadBaseCents: 0n,
      inputs: [{ inputId: inp.id, actualQty: "10" }],
    });
    // costo = 10kg×10.00 = 100.00 / 10L = 10.00/L; sin margen previo → +30%
    const [p] = await db
      .select()
      .from(products)
      .where(eq(products.id, terminado.id));
    expect(p.priceCents).toBe(13_00n);
  });

  it("con margen previo positivo: lo mantiene sobre el nuevo costo", async () => {
    const { terminado, insumo, recipeId } = await setupRecipe({
      price: 20_00n,
      sellable: true,
    });
    const order1 = await createOrder(db, orgId, USER, { recipeId });
    const inp1 = await firstInput(order1.id);
    await confirmOrder(db, orgId, USER, order1.id, {
      producedQty: "10",
      laborCostBaseCents: 0n,
      overheadBaseCents: 0n,
      inputs: [{ inputId: inp1.id, actualQty: "10" }],
    });
    let [p] = await db
      .select()
      .from(products)
      .where(eq(products.id, terminado.id));
    // precioAnterior=20.00 pero costoAnterior=0 (sin stock previo) → rama
    // else del ERP: 30% default → 10.00×1.3 = 13.00
    expect(p.priceCents).toBe(13_00n);

    // encarece el insumo → sube el CPP del terminado en la 2ª producción
    await registerMovement(db, orgId, USER, {
      productId: insumo.id,
      kind: "in",
      qty: "100",
      unitCostCents: 20_00n,
    });
    const order2 = await createOrder(db, orgId, USER, { recipeId });
    const inp2 = await firstInput(order2.id);
    await confirmOrder(db, orgId, USER, order2.id, {
      producedQty: "10",
      laborCostBaseCents: 0n,
      overheadBaseCents: 0n,
      inputs: [{ inputId: inp2.id, actualQty: "10" }],
    });
    [p] = await db.select().from(products).where(eq(products.id, terminado.id));

    const [ultimoMov] = await db
      .select({ avg: inventoryMovements.balanceAvgCostBaseCents })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.productId, terminado.id))
      .orderBy(sql`seq desc`)
      .limit(1);
    const nuevoCosto = ultimoMov.avg;
    expect(p.priceCents).toBeGreaterThan(nuevoCosto);
    // margen previo (30%) se mantiene sobre el costo nuevo, no un valor fijo
    const margenReal =
      (Number(p.priceCents - nuevoCosto) / Number(nuevoCosto)) * 100;
    expect(margenReal).toBeCloseTo(30, 0);
  });

  it("producto NO vendible: no se toca el precio", async () => {
    const { terminado, recipeId } = await setupRecipe({ sellable: false });
    const order = await createOrder(db, orgId, USER, { recipeId });
    const inp = await firstInput(order.id);
    await confirmOrder(db, orgId, USER, order.id, {
      producedQty: "10",
      laborCostBaseCents: 0n,
      overheadBaseCents: 0n,
      inputs: [{ inputId: inp.id, actualQty: "10" }],
    });
    const [p] = await db
      .select()
      .from(products)
      .where(eq(products.id, terminado.id));
    expect(p.priceCents).toBe(0n);
  });
});

describe("paridad producción — lote del terminado nace al confirmar", () => {
  it("crea un lote único (PROD-{orderId}) enlazado al movimiento de entrada", async () => {
    const { terminado, recipeId } = await setupRecipe();
    const order = await createOrder(db, orgId, USER, { recipeId });
    const inp = await firstInput(order.id);
    await confirmOrder(db, orgId, USER, order.id, {
      producedQty: "10",
      laborCostBaseCents: 0n,
      overheadBaseCents: 0n,
      inputs: [{ inputId: inp.id, actualQty: "10" }],
    });
    const [lot] = await db
      .select()
      .from(lots)
      .where(and(eq(lots.orgId, orgId), eq(lots.code, `PROD-${order.id}`)));
    expect(lot).toBeDefined();
    expect(lot.productId).toBe(terminado.id);
  });
});
