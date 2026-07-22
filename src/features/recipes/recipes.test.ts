// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createProduct, registerMovement } from "@/features/inventory/queries";
import {
  createRecipe,
  updateRecipe,
  listRecipes,
  getRecipeDetail,
  softDeleteRecipe,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let terminado: string;
let sles: string;
let sal: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "m7a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "m7b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });

  const t = await createProduct(db, orgA, USER, {
    name: "Detergente Fregar 1L",
    unit: "L",
    isProducible: true,
  });
  terminado = t.id;
  const s1 = await createProduct(db, orgA, USER, {
    name: "SLES 70%",
    unit: "kg",
    isComponent: true,
    isSellable: false,
  });
  sles = s1.id;
  const s2 = await createProduct(db, orgA, USER, {
    name: "Sal industrial",
    unit: "kg",
    isComponent: true,
    isSellable: false,
  });
  sal = s2.id;
  // costos promedio: SLES 50.00/kg, sal 10.00/kg
  await registerMovement(db, orgA, USER, {
    productId: sles,
    kind: "in",
    qty: "100",
    unitCostCents: 5000n,
  });
  await registerMovement(db, orgA, USER, {
    productId: sal,
    kind: "in",
    qty: "100",
    unitCostCents: 1000n,
  });
});

describe("recetas (BOM)", () => {
  let recipeId: string;

  it("crea la receta con insumos y la lista", async () => {
    const r = await createRecipe(db, orgA, USER, {
      productId: terminado,
      name: "Fórmula estándar 100L",
      outputQty: "100",
      items: [
        { productId: sles, qty: "10" }, // 10 kg SLES
        { productId: sal, qty: "5" }, // 5 kg sal
      ],
    });
    recipeId = r.id;
    const list = await listRecipes(db, orgA);
    expect(list).toHaveLength(1);
    expect(list[0].productName).toBe("Detergente Fregar 1L");
  });

  it("calcula el costo teórico del lote y unitario al promedio vigente", async () => {
    const detail = await getRecipeDetail(db, orgA, recipeId);
    // 10kg × 50.00 + 5kg × 10.00 = 550.00 el lote de 100L
    expect(detail.batchCostCents).toBe(55000n);
    // 550.00 / 100 = 5.50 por L
    expect(detail.unitCostCents).toBe(550n);
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0].componentName).toBe("SLES 70%");
  });

  it("actualizar reemplaza los insumos", async () => {
    await updateRecipe(db, orgA, USER, recipeId, {
      productId: terminado,
      name: "Fórmula v2",
      outputQty: "100",
      items: [{ productId: sles, qty: "12" }],
    });
    const detail = await getRecipeDetail(db, orgA, recipeId);
    expect(detail.recipe.name).toBe("Fórmula v2");
    expect(detail.items).toHaveLength(1);
    expect(detail.batchCostCents).toBe(60000n); // 12 × 50.00
  });

  it("valida: sin insumos o cantidades inválidas se rechaza", async () => {
    await expect(
      createRecipe(db, orgA, USER, {
        productId: terminado,
        name: "Vacía",
        outputQty: "10",
        items: [],
      }),
    ).rejects.toThrow();
    await expect(
      createRecipe(db, orgA, USER, {
        productId: terminado,
        name: "Mala",
        outputQty: "0",
        items: [{ productId: sles, qty: "1" }],
      }),
    ).rejects.toThrow();
  });

  it("aislamiento: otra org no ve ni edita la receta", async () => {
    await expect(getRecipeDetail(db, orgB, recipeId)).rejects.toThrow();
    await expect(softDeleteRecipe(db, orgB, USER, recipeId)).rejects.toThrow();
  });

  it("soft delete la saca de la lista", async () => {
    await softDeleteRecipe(db, orgA, USER, recipeId);
    const list = await listRecipes(db, orgA);
    expect(list).toHaveLength(0);
  });
});
