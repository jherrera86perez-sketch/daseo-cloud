import { and, asc, eq } from "drizzle-orm";
import { recipes, recipeItems, products } from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { parseQtyToMilli } from "@/lib/qty";
import { getStock, getOwnedProduct } from "@/features/inventory/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeItemRow = typeof recipeItems.$inferSelect & {
  componentName?: string;
  componentUnit?: string;
};

export type RecipeInput = {
  productId: string;
  name: string;
  outputQty: string;
  items: Array<{ productId: string; qty: string }>;
};

function validate(input: RecipeInput) {
  if (input.items.length === 0) {
    throw new Error("La receta necesita al menos un insumo");
  }
  parseQtyToMilli(input.outputQty); // rechaza 0/negativos/basura
  for (const item of input.items) {
    parseQtyToMilli(item.qty);
  }
}

export async function createRecipe(
  db: Db,
  orgId: string,
  userId: UserId,
  input: RecipeInput,
): Promise<RecipeRow> {
  validate(input);
  await getOwnedProduct(db, orgId, input.productId);
  for (const item of input.items) {
    await getOwnedProduct(db, orgId, item.productId);
  }
  return db.transaction(async (tx: Db) => {
    const [recipe] = await tx
      .insert(recipes)
      .values({
        orgId,
        productId: input.productId,
        name: input.name,
        outputQty: input.outputQty.replace(",", "."),
      })
      .returning();
    await tx.insert(recipeItems).values(
      input.items.map((i) => ({
        orgId,
        recipeId: recipe.id,
        productId: i.productId,
        qty: i.qty.replace(",", "."),
      })),
    );
    await logAudit(tx, {
      orgId,
      userId,
      entity: "recipe",
      entityId: recipe.id,
      action: "create",
      after: { name: input.name, items: input.items.length },
    });
    return recipe;
  });
}

async function getOwnedRecipe(
  db: Db,
  orgId: string,
  id: string,
): Promise<RecipeRow> {
  const [row] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), notDeleted(recipes)));
  return assertOwnedByOrg(row, orgId);
}

/** Reemplaza cabecera e insumos (las órdenes ya emitidas no se ven afectadas). */
export async function updateRecipe(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: RecipeInput,
): Promise<RecipeRow> {
  validate(input);
  await getOwnedRecipe(db, orgId, id);
  for (const item of input.items) {
    await getOwnedProduct(db, orgId, item.productId);
  }
  return db.transaction(async (tx: Db) => {
    const [updated] = await tx
      .update(recipes)
      .set({
        name: input.name,
        productId: input.productId,
        outputQty: input.outputQty.replace(",", "."),
        updatedAt: new Date(),
      })
      .where(and(eq(recipes.id, id), eq(recipes.orgId, orgId)))
      .returning();
    await tx.delete(recipeItems).where(eq(recipeItems.recipeId, id));
    await tx.insert(recipeItems).values(
      input.items.map((i) => ({
        orgId,
        recipeId: id,
        productId: i.productId,
        qty: i.qty.replace(",", "."),
      })),
    );
    await logAudit(tx, {
      orgId,
      userId,
      entity: "recipe",
      entityId: id,
      action: "update",
      after: { name: input.name, items: input.items.length },
    });
    return updated;
  });
}

export async function softDeleteRecipe(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  await getOwnedRecipe(db, orgId, id);
  await db
    .update(recipes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(recipes.id, id), eq(recipes.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "recipe",
    entityId: id,
    action: "delete",
  });
}

export async function listRecipes(
  db: Db,
  orgId: string,
): Promise<Array<RecipeRow & { productName: string; productUnit: string }>> {
  const rows = await db
    .select({
      recipe: recipes,
      productName: products.name,
      productUnit: products.unit,
    })
    .from(recipes)
    .innerJoin(products, eq(recipes.productId, products.id))
    .where(and(eq(recipes.orgId, orgId), notDeleted(recipes)))
    .orderBy(asc(recipes.name));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    ...r.recipe,
    productName: r.productName,
    productUnit: r.productUnit,
  }));
}

/**
 * Detalle con costo teórico: Σ(qty insumo × costo promedio vigente en base).
 * Es referencial — el costo REAL lo fija la orden de producción (M8).
 */
export async function getRecipeDetail(
  db: Db,
  orgId: string,
  id: string,
): Promise<{
  recipe: RecipeRow;
  items: Array<RecipeItemRow & { avgCostCents: bigint; lineCostCents: bigint }>;
  batchCostCents: bigint;
  unitCostCents: bigint;
}> {
  const recipe = await getOwnedRecipe(db, orgId, id);
  const rawItems = await db
    .select({
      item: recipeItems,
      componentName: products.name,
      componentUnit: products.unit,
    })
    .from(recipeItems)
    .innerJoin(products, eq(recipeItems.productId, products.id))
    .where(eq(recipeItems.recipeId, id));

  let batchCostCents = 0n;
  const items = [];
  for (const r of rawItems) {
    const stock = await getStock(db, orgId, r.item.productId);
    const qtyMilli = parseQtyToMilli(r.item.qty);
    const lineCostCents = (qtyMilli * stock.avgCostCents + 500n) / 1000n;
    batchCostCents += lineCostCents;
    items.push({
      ...r.item,
      componentName: r.componentName,
      componentUnit: r.componentUnit,
      avgCostCents: stock.avgCostCents,
      lineCostCents,
    });
  }
  const outputMilli = parseQtyToMilli(recipe.outputQty);
  const unitCostCents =
    (batchCostCents * 1000n + outputMilli / 2n) / outputMilli;
  return { recipe, items, batchCostCents, unitCostCents };
}
