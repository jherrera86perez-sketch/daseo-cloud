import { and, desc, eq } from "drizzle-orm";
import {
  productionOrders,
  productionInputs,
  productionLabor,
  productionOverheadItems,
  products,
  recipes,
  employees,
  lots,
} from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { parseQtyToMilli } from "@/lib/qty";
import { registerMovement, getStock } from "@/features/inventory/queries";
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
    /** ≈ merma_registrada del ERP: unidades del terminado perdidas */
    wasteQty?: string;
    /** Mano de obra por empleado (produccion_mano_obra del ERP). Si viene,
     * laborCostBaseCents se CALCULA como Σ horas×costo_hora. */
    labor?: Array<{ employeeId: string; hours: string; costHourCents: bigint }>;
    /** ≈ produccion_costos_adicionales del ERP ("Otros Gastos Adicionales"):
     * renglones libres concepto+monto, NO prorrateados entre insumos. Si
     * vienen, overheadBaseCents se CALCULA como su suma. */
    overheadItems?: Array<{ concept: string; amountCents: bigint }>;
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

    // Líneas de mano de obra: validan pertenencia y fijan el devengado real
    let laborCents = input.laborCostBaseCents;
    if (input.labor && input.labor.length > 0) {
      laborCents = 0n;
      for (const line of input.labor) {
        const [emp] = await tx
          .select({ id: employees.id, orgId: employees.orgId })
          .from(employees)
          .where(eq(employees.id, line.employeeId));
        assertOwnedByOrg(emp, orgId);
        if (line.costHourCents < 0n) {
          throw new Error("Los costos no pueden ser negativos");
        }
        const hoursMilli = parseQtyToMilli(line.hours);
        laborCents += (hoursMilli * line.costHourCents + 500n) / 1000n;
        await tx.insert(productionLabor).values({
          orgId,
          orderId: id,
          employeeId: line.employeeId,
          hours: line.hours.replace(",", "."),
          costHourCents: line.costHourCents,
        });
      }
    }

    // Costos indirectos itemizados: si vienen, reemplazan el monto manual
    let overheadCents = input.overheadBaseCents;
    if (input.overheadItems && input.overheadItems.length > 0) {
      overheadCents = 0n;
      for (const item of input.overheadItems) {
        if (item.amountCents < 0n) {
          throw new Error("Los costos no pueden ser negativos");
        }
        overheadCents += item.amountCents;
        await tx.insert(productionOverheadItems).values({
          orgId,
          orderId: id,
          concept: item.concept,
          amountCents: item.amountCents,
        });
      }
    }

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

    const totalCostCents = inputsCostCents + laborCents + overheadCents;
    const unitCostCents =
      (totalCostCents * 1000n + producedMilli / 2n) / producedMilli;

    // Costo ANTES de esta producción (para el margen del ERP, ver abajo)
    const stockAntes = await getStock(tx, orgId, order.productId);
    const costoAnteriorCents = stockAntes.avgCostCents;

    // ≈ código de lote del terminado del ERP: nace en producción (como en
    // compras). Único por orden — trazable, sin colisión posible.
    const [lot] = await tx
      .insert(lots)
      .values({
        orgId,
        productId: order.productId,
        code: `PROD-${id}`,
      })
      .returning();

    const finishedMovement = await registerMovement(tx, orgId, userId, {
      productId: order.productId,
      kind: "in",
      qty: input.producedQty,
      unitCostCents,
      sourceType: "production_in",
      sourceId: id,
      lotId: lot.id,
    });

    // ERP: al confirmar producción, el precio de venta se recalcula
    // manteniendo el margen % previo (30% por defecto si no había margen
    // positivo) — nuevoPrecio = nuevoCosto × (1 + margen). Solo aplica a
    // productos vendibles con precio propio (evita inflar intermedios).
    const [product] = await tx
      .select({
        priceCents: products.priceCents,
        isSellable: products.isSellable,
      })
      .from(products)
      .where(eq(products.id, order.productId));
    if (product?.isSellable) {
      const nuevoCostoCents = finishedMovement.balanceAvgCostBaseCents;
      const precioAnteriorCents = product.priceCents;
      const margenMicros =
        costoAnteriorCents > 0n && precioAnteriorCents > costoAnteriorCents
          ? ((precioAnteriorCents - costoAnteriorCents) * 1_000_000n) /
            costoAnteriorCents
          : 300_000n; // 30% por defecto, igual que el ERP
      const nuevoPrecioCents =
        (nuevoCostoCents * (1_000_000n + margenMicros) + 500_000n) / 1_000_000n;
      await tx
        .update(products)
        .set({ priceCents: nuevoPrecioCents, updatedAt: new Date() })
        .where(eq(products.id, order.productId));
    }

    const [updated] = await tx
      .update(productionOrders)
      .set({
        status: "confirmed",
        producedQty: input.producedQty.replace(",", "."),
        wasteQty: input.wasteQty ? input.wasteQty.replace(",", ".") : null,
        laborCostBaseCents: laborCents,
        overheadBaseCents: overheadCents,
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
