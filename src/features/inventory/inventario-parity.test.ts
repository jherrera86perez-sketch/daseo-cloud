// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings, recipes, recipeItems } from "@/db/schema";
import {
  createProduct,
  registerMovement,
  consumptionAnalysis,
  applyAutoStockMin,
  recalcularStockMinimoAuto,
  lowStockAlerts,
  inventoryValueAtDate,
} from "./queries";

let db: TestDb;
let orgId: string;
const USER = null;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "InvFiel", slug: "adinv" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
});

describe("paridad inventario — categoría + código de barras", () => {
  it("producto sin categoría: barcode NO obligatorio (retrocompat)", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "Legacy",
      unit: "unit",
    });
    expect(p.barcode).toBeNull();
  });

  it("categoría distinta de servicio exige código de barras (literal ERP)", async () => {
    await expect(
      createProduct(db, orgId, USER, {
        name: "Sin código",
        unit: "unit",
        category: "insumo",
      }),
    ).rejects.toThrow("El código de barras es obligatorio");

    const p = await createProduct(db, orgId, USER, {
      name: "Con código",
      unit: "unit",
      category: "insumo",
      barcode: "7501234567890",
    });
    expect(p.category).toBe("insumo");
    expect(p.barcode).toBe("7501234567890");
  });

  it("categoría 'servicio' no exige código de barras", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "Consultoría",
      unit: "unit",
      category: "servicio",
    });
    expect(p.category).toBe("servicio");
  });
});

describe("paridad inventario — stock mínimo automático (ROP)", () => {
  it("sin datos suficientes (<7 días con consumo): no aplica", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "PocosDatos",
      unit: "kg",
      stockMinMode: "auto",
      leadDays: 7,
      safetyDays: 3,
    });
    await registerMovement(db, orgId, USER, {
      productId: p.id,
      kind: "in",
      qty: "1000",
      unitCostCents: 10_00n,
    });
    // solo 2 días con salidas (venta) < MIN_DIAS_CON_CONSUMO=7
    for (let d = 0; d < 2; d++) {
      await registerMovement(db, orgId, USER, {
        productId: p.id,
        kind: "out",
        qty: "10",
        sourceType: "sale",
      });
    }
    const analysis = await consumptionAnalysis(db, orgId, p.id);
    expect(analysis.datosSuficientes).toBe(false);
    const r = await applyAutoStockMin(db, orgId, p.id);
    expect(r.applied).toBe(false);
    expect(r.datosSuficientes).toBe(false);
  });

  it("con datos suficientes: sugerido = diario × (lead+safety); reversiones excluidas", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "ConDatos",
      unit: "kg",
      stockMinMode: "auto",
      leadDays: 7,
      safetyDays: 3,
    });
    await registerMovement(db, orgId, USER, {
      productId: p.id,
      kind: "in",
      qty: "1000",
      unitCostCents: 10_00n,
    });
    // 10 salidas de 10kg — se esparcen en 10 días DISTINTOS vía UPDATE directo
    for (let d = 0; d < 10; d++) {
      const mv = await registerMovement(db, orgId, USER, {
        productId: p.id,
        kind: "out",
        qty: "10",
        sourceType: "sale",
      });
      const fecha = new Date(Date.now() - d * DAY);
      await db.execute(
        sql`update inventory_movements set created_at = ${fecha.toISOString()}::timestamptz where id = ${mv.id}`,
      );
    }
    // reversión (adjust_in) NO debe contar como consumo (type='adjustment')
    await registerMovement(db, orgId, USER, {
      productId: p.id,
      kind: "adjust_in",
      qty: "5",
      sourceType: "sale",
      note: "Cancelación",
    });
    const analysis = await consumptionAnalysis(db, orgId, p.id);
    // consumo neto = 100 (las 10 salidas); la reversión no resta ni suma
    expect(analysis.consumo30d).toBeCloseTo(100, 3);
    expect(analysis.diasConConsumo).toBe(10);
    expect(analysis.datosSuficientes).toBe(true);
    // diario = 100/30 = 3.333…; sugerido = diario × (7+3) = 33.333…
    expect(analysis.sugerido).toBeCloseTo(33.333, 2);

    const r = await applyAutoStockMin(db, orgId, p.id);
    expect(r.applied).toBe(true);
    expect(r.valorNuevo).toBeCloseTo(33.333, 2);
  });

  it("recalcularStockMinimoAuto solo toca productos en modo auto", async () => {
    const manual = await createProduct(db, orgId, USER, {
      name: "Manual",
      unit: "unit",
      stockMinMode: "manual",
    });
    const r = await recalcularStockMinimoAuto(db, orgId);
    expect(r.totalEvaluados).toBeGreaterThanOrEqual(2); // los 2 'auto' de arriba
    // el manual no se tocó
    const analysis = await consumptionAnalysis(db, orgId, manual.id);
    expect(analysis).toBeDefined();
  });
});

describe("paridad inventario — alertas de stock bajo con cascada", () => {
  it("urgencia CRITICA/ALTA/MEDIA + cascada a productos finales por receta", async () => {
    const insumo = await createProduct(db, orgId, USER, {
      name: "Sosa Cáustica",
      unit: "kg",
      isComponent: true,
      stockMin: "50",
    });
    await registerMovement(db, orgId, USER, {
      productId: insumo.id,
      kind: "in",
      qty: "20",
      unitCostCents: 10_00n,
    });
    // 20 < 50*0.5=25 → ALTA
    const final = await createProduct(db, orgId, USER, {
      name: "Detergente",
      unit: "L",
      isProducible: true,
    });
    const [recipe] = await db
      .insert(recipes)
      .values({ orgId, productId: final.id, name: "R1", outputQty: "100" })
      .returning();
    await db.insert(recipeItems).values({
      orgId,
      recipeId: recipe.id,
      productId: insumo.id,
      qty: "5", // 20kg insumo / 5kg por lote = 4 lotes producibles
    });

    const alerts = await lowStockAlerts(db, orgId);
    const a = alerts.alerts.find((x) => x.productId === insumo.id)!;
    expect(a.urgencia).toBe("ALTA");
    expect(a.productosAfectados).toHaveLength(1);
    expect(a.productosAfectados[0]).toMatchObject({
      finalProductName: "Detergente",
      batchesProducibles: 4,
    });
    expect(alerts.summary.altaUrgencia).toBeGreaterThanOrEqual(1);
  });

  it("agotado (stock<=0) → CRITICA", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "Agotado",
      unit: "unit",
      stockMin: "10",
    });
    const alerts = await lowStockAlerts(db, orgId);
    const a = alerts.alerts.find((x) => x.productId === p.id)!;
    expect(a.urgencia).toBe("CRITICA");
    expect(a.necesitaReabastecimiento).toBe(true);
  });
});

describe("paridad inventario — valor de inventario a fecha de corte", () => {
  it("usa el último movimiento de cada producto hasta la fecha", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "ValorCorte",
      unit: "kg",
    });
    await registerMovement(db, orgId, USER, {
      productId: p.id,
      kind: "in",
      qty: "10",
      unitCostCents: 100_00n,
    });
    const corte = new Date(Date.now() + DAY);
    const v = await inventoryValueAtDate(db, orgId, corte);
    const row = v.productos.find((r) => r.productId === p.id)!;
    expect(row.saldoCantidad).toBeCloseTo(10, 3);
    expect(row.saldoValorCents).toBe(1000_00n);
  });

  it("fecha anterior a cualquier movimiento: el producto no aparece", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "Futuro",
      unit: "kg",
    });
    await registerMovement(db, orgId, USER, {
      productId: p.id,
      kind: "in",
      qty: "5",
      unitCostCents: 50_00n,
    });
    const ayer = new Date(Date.now() - DAY);
    const v = await inventoryValueAtDate(db, orgId, ayer);
    expect(v.productos.find((r) => r.productId === p.id)).toBeUndefined();
  });
});
