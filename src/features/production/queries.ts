import { and, desc, eq } from "drizzle-orm";
import {
  productionOrders,
  productionInputs,
  products,
  recipes,
} from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { parseQtyToMilli } from "@/lib/qty";
import { registerMovement } from "@/features/inventory/queries";
import { getRecipeDetail } from "@/features/recipes/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type OrderRow = typeof productionOrders.$inferSelect;
export type OrderInputRow = typeof productionInputs.$inferSelect & {
  componentName?: string;
  componentUnit?: string;
};

/** Crea la orden en borrador con los insumos planificados de la receta. */
export async function createOrder(
  db: Db,
  orgId: string,
  userId: UserId,
  input: { recipeId: string; note?: string },
): Promise<OrderRow> {
  const { recipe, items } = await getRecipeDetail(db, orgId, input.recipeId);
  return db.transaction(async (tx: Db) => {
    const [order] = await tx
      .insert(productionOrders)
      .values({
        orgId,
        recipeId: recipe.id,
        productId: recipe.productId,
        note: input.note,
      })
      .returning();
    await tx.insert(productionInputs).values(
      items.map((i) => ({
        orgId,
        orderId: order.id,
        productId: i.productId,
        plannedQty: i.qty,
      })),
    );
    await logAudit(tx, {
      orgId,
      userId,
      entity: "production_order",
      entityId: order.id,
      action: "create",
      after: { recipe: recipe.name },
    });
    return order;
  });
}

async function getOwnedOrder(
  db: Db,
  orgId: string,
  id: string,
): Promise<OrderRow> {
  const [row] = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.id, id));
  return assertOwnedByOrg(row, orgId);
}

/**
 * Confirmar = UNA transacción:
 * 1. consume cada insumo por su cantidad REAL (production_out, al promedio)
 * 2. costo total = Σ consumos + mano de obra + indirectos
 * 3. entrada del terminado (production_in) al costo unitario real
 * Si falta stock de cualquier insumo, nada se aplica.
 */
export async function confirmOrder(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: {
    producedQty: string;
    laborCostBaseCents: bigint;
    overheadBaseCents: bigint;
    inputs: Array<{ inputId: string; actualQty: string }>;
  },
): Promise<OrderRow> {
  return db.transaction(async (tx: Db) => {
    const order = await getOwnedOrder(tx, orgId, id);
    if (order.status !== "draft") {
      throw new Error("Solo se confirman órdenes en borrador");
    }
    if (input.laborCostBaseCents < 0n || input.overheadBaseCents < 0n) {
      throw new Error("Los costos no pueden ser negativos");
    }
    const producedMilli = parseQtyToMilli(input.producedQty);

    const rows: OrderInputRow[] = await tx
      .select()
      .from(productionInputs)
      .where(eq(productionInputs.orderId, id));

    let inputsCostCents = 0n;
    for (const row of rows) {
      const actual = input.inputs.find((i) => i.inputId === row.id);
      if (!actual) {
        throw new Error("Falta la cantidad real de un insumo");
      }
      const movement = await registerMovement(tx, orgId, userId, {
        productId: row.productId,
        kind: "out",
        qty: actual.actualQty,
        sourceType: "production_out",
        sourceId: id,
      });
      const qtyMilli = parseQtyToMilli(actual.actualQty);
      inputsCostCents +=
        (qtyMilli * (movement.unitCostBaseCents ?? 0n) + 500n) / 1000n;
      await tx
        .update(productionInputs)
        .set({
          actualQty: actual.actualQty.replace(",", "."),
          unitCostBaseCents: movement.unitCostBaseCents,
        })
        .where(eq(productionInputs.id, row.id));
    }

    const totalCostCents =
      inputsCostCents + input.laborCostBaseCents + input.overheadBaseCents;
    const unitCostCents =
      (totalCostCents * 1000n + producedMilli / 2n) / producedMilli;

    await registerMovement(tx, orgId, userId, {
      productId: order.productId,
      kind: "in",
      qty: input.producedQty,
      unitCostCents,
      sourceType: "production_in",
      sourceId: id,
    });

    const [updated] = await tx
      .update(productionOrders)
      .set({
        status: "confirmed",
        producedQty: input.producedQty.replace(",", "."),
        laborCostBaseCents: input.laborCostBaseCents,
        overheadBaseCents: input.overheadBaseCents,
        updatedAt: new Date(),
      })
      .where(eq(productionOrders.id, id))
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "production_order",
      entityId: id,
      action: "update",
      after: {
        status: "confirmed",
        produced: input.producedQty,
        totalCost: totalCostCents.toString(),
      },
    });
    return updated;
  });
}

/** Solo los borradores se cancelan; una orden confirmada se revierte con ajustes. */
export async function cancelOrder(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<OrderRow> {
  const order = await getOwnedOrder(db, orgId, id);
  if (order.status !== "draft") {
    throw new Error("Solo se cancelan órdenes en borrador");
  }
  const [updated] = await db
    .update(productionOrders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(productionOrders.id, id), eq(productionOrders.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "production_order",
    entityId: id,
    action: "cancel",
  });
  return updated;
}

export async function getOrderDetail(
  db: Db,
  orgId: string,
  id: string,
): Promise<{
  order: OrderRow & { productName?: string; recipeName?: string };
  inputs: OrderInputRow[];
}> {
  const order = await getOwnedOrder(db, orgId, id);
  const [meta] = await db
    .select({ productName: products.name, recipeName: recipes.name })
    .from(productionOrders)
    .innerJoin(products, eq(productionOrders.productId, products.id))
    .innerJoin(recipes, eq(productionOrders.recipeId, recipes.id))
    .where(eq(productionOrders.id, id));
  const inputs = await db
    .select({
      input: productionInputs,
      componentName: products.name,
      componentUnit: products.unit,
    })
    .from(productionInputs)
    .innerJoin(products, eq(productionInputs.productId, products.id))
    .where(eq(productionInputs.orderId, id));
  return {
    order: { ...order, ...meta },
    inputs: inputs.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => ({
        ...r.input,
        componentName: r.componentName,
        componentUnit: r.componentUnit,
      }),
    ),
  };
}

export async function listOrders(
  db: Db,
  orgId: string,
): Promise<Array<OrderRow & { productName: string; recipeName: string }>> {
  const rows = await db
    .select({
      order: productionOrders,
      productName: products.name,
      recipeName: recipes.name,
    })
    .from(productionOrders)
    .innerJoin(products, eq(productionOrders.productId, products.id))
    .innerJoin(recipes, eq(productionOrders.recipeId, recipes.id))
    .where(eq(productionOrders.orgId, orgId))
    .orderBy(desc(productionOrders.createdAt));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    ...r.order,
    productName: r.productName,
    recipeName: r.recipeName,
  }));
}
