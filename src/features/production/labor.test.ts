// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import {
  organizations,
  orgSettings,
  recipes,
  recipeItems,
  productionInputs,
  productionLabor,
} from "@/db/schema";
import { createProduct, registerMovement } from "@/features/inventory/queries";
import { createEmployee } from "@/features/people/queries";
import { createOrder, confirmOrder } from "./queries";

let db: TestDb;
let orgId: string;
let recipeId: string;
let empA: string;
let empB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "Labor", slug: "adlabor" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });

  const insumo = await createProduct(db, orgId, USER, {
    name: "Sosa",
    unit: "kg",
    isComponent: true,
  });
  await registerMovement(db, orgId, USER, {
    productId: insumo.id,
    kind: "in",
    qty: "100",
    unitCostCents: 10_00n,
  });
  const final = await createProduct(db, orgId, USER, {
    name: "Detergente",
    unit: "L",
    isProducible: true,
  });
  const [recipe] = await db
    .insert(recipes)
    .values({ orgId, productId: final.id, name: "R", outputQty: "10" })
    .returning();
  recipeId = recipe.id;
  await db.insert(recipeItems).values({
    orgId,
    recipeId,
    productId: insumo.id,
    qty: "10",
  });

  empA = (
    await createEmployee(db, orgId, USER, {
      name: "Naydit",
      role: "Operaria",
      salaryCents: 5000_00n,
    })
  ).id;
  empB = (
    await createEmployee(db, orgId, USER, {
      name: "Yamel",
      role: "Operario",
      salaryCents: 5000_00n,
    })
  ).id;
});

describe("mano de obra por empleado en órdenes (produccion_mano_obra)", () => {
  it("confirmar con líneas: devengado = Σ horas×costo_hora y merma en la orden", async () => {
    const order = await createOrder(db, orgId, USER, { recipeId });
    const inputs = await db
      .select()
      .from(productionInputs)
      .where(eq(productionInputs.orderId, order.id));

    const confirmed = await confirmOrder(db, orgId, USER, order.id, {
      producedQty: "10",
      laborCostBaseCents: 0n,
      overheadBaseCents: 50_00n,
      inputs: [{ inputId: inputs[0].id, actualQty: "10" }],
      wasteQty: "1.5",
      labor: [
        { employeeId: empA, hours: "2.00", costHourCents: 25_00n }, // $50
        { employeeId: empB, hours: "1.50", costHourCents: 20_00n }, // $30
      ],
    });

    // laborCents calculado desde las líneas: 50.00 + 30.00 = 80.00
    expect(confirmed.laborCostBaseCents).toBe(80_00n);
    expect(confirmed.wasteQty).toBe("1.500");

    const rows = await db
      .select()
      .from(productionLabor)
      .where(eq(productionLabor.orderId, order.id));
    expect(rows).toHaveLength(2);
  });

  it("sin líneas: el monto manual sigue funcionando (órdenes viejas intactas)", async () => {
    const order = await createOrder(db, orgId, USER, { recipeId });
    const inputs = await db
      .select()
      .from(productionInputs)
      .where(eq(productionInputs.orderId, order.id));
    const confirmed = await confirmOrder(db, orgId, USER, order.id, {
      producedQty: "10",
      laborCostBaseCents: 200_00n,
      overheadBaseCents: 0n,
      inputs: [{ inputId: inputs[0].id, actualQty: "10" }],
    });
    expect(confirmed.laborCostBaseCents).toBe(200_00n);
    expect(confirmed.wasteQty).toBeNull();
  });

  it("empleado de otra org es rechazado", async () => {
    const [b] = await db
      .insert(organizations)
      .values({ name: "Ajena", slug: "adlaborb" })
      .returning();
    const ajeno = await createEmployee(db, b.id, USER, {
      name: "Intruso",
      salaryCents: 0n,
    });
    const order = await createOrder(db, orgId, USER, { recipeId });
    const inputs = await db
      .select()
      .from(productionInputs)
      .where(eq(productionInputs.orderId, order.id));
    await expect(
      confirmOrder(db, orgId, USER, order.id, {
        producedQty: "10",
        laborCostBaseCents: 0n,
        overheadBaseCents: 0n,
        inputs: [{ inputId: inputs[0].id, actualQty: "10" }],
        labor: [{ employeeId: ajeno.id, hours: "1.00", costHourCents: 10_00n }],
      }),
    ).rejects.toThrow();
  });
});
