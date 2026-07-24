import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { products, inventoryMovements } from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { parseQtyToMilli, milliToQtyString, weightedAvgCents } from "@/lib/qty";
import { productInputSchema } from "./schemas";
import type { ProductInput, MovementInput } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type ProductRow = typeof products.$inferSelect;
export type MovementRow = typeof inventoryMovements.$inferSelect;
export type Stock = { qtyMilli: bigint; avgCostCents: bigint };

export class InsufficientStockError extends Error {
  constructor(available: string, requested: string) {
    super(`Stock insuficiente: hay ${available}, se pidió ${requested}`);
    this.name = "InsufficientStockError";
  }
}

export async function listProducts(
  db: Db,
  orgId: string,
  opts: { search?: string },
): Promise<ProductRow[]> {
  const filters = [eq(products.orgId, orgId), notDeleted(products)];
  if (opts.search) {
    filters.push(ilike(products.name, `%${opts.search}%`));
  }
  return db
    .select()
    .from(products)
    .where(and(...filters))
    .orderBy(products.name);
}

export async function getOwnedProduct(
  db: Db,
  orgId: string,
  id: string,
): Promise<ProductRow> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), notDeleted(products)));
  return assertOwnedByOrg(row, orgId);
}

export async function createProduct(
  db: Db,
  orgId: string,
  userId: UserId,
  input: ProductInput,
): Promise<ProductRow> {
  const data = productInputSchema.parse(input);
  const [row] = await db
    .insert(products)
    .values({
      ...data,
      stockMin: data.stockMin?.replace(",", ".") ?? "0",
      orgId,
    })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "product",
    entityId: row.id,
    action: "create",
    after: input,
  });
  return row;
}

export async function updateProduct(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: ProductInput,
): Promise<ProductRow> {
  await getOwnedProduct(db, orgId, id);
  const data = productInputSchema.parse(input);
  const [row] = await db
    .update(products)
    .set({
      ...data,
      stockMin: data.stockMin?.replace(",", ".") ?? "0",
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "product",
    entityId: id,
    action: "update",
    after: input,
  });
  return row;
}

export async function softDeleteProduct(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  await getOwnedProduct(db, orgId, id);
  await db
    .update(products)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "product",
    entityId: id,
    action: "delete",
  });
}

/** Último saldo del kardex (0 si no hay movimientos). */
export async function getStock(
  db: Db,
  orgId: string,
  productId: string,
): Promise<Stock> {
  const [last] = await db
    .select({
      balanceQty: inventoryMovements.balanceQty,
      balanceAvg: inventoryMovements.balanceAvgCostBaseCents,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.orgId, orgId),
        eq(inventoryMovements.productId, productId),
      ),
    )
    .orderBy(desc(inventoryMovements.seq))
    .limit(1);
  if (!last) {
    return { qtyMilli: 0n, avgCostCents: 0n };
  }
  return {
    qtyMilli: parseQtyToMilliSafe(last.balanceQty),
    avgCostCents: last.balanceAvg,
  };
}

function parseQtyToMilliSafe(numericStr: string): bigint {
  if (Number(numericStr) === 0) return 0n;
  return parseQtyToMilli(numericStr);
}

/**
 * Registra un movimiento manual/ajuste y actualiza el kardex en UNA
 * transacción con bloqueo de la fila del producto (stock negativo imposible).
 * Entradas: exigen costo unitario (en base). Salidas: se valoran al promedio.
 */
export async function registerMovement(
  db: Db,
  orgId: string,
  userId: UserId,
  input: MovementInput & {
    sourceType?: string;
    sourceId?: string;
    lotId?: string;
  },
): Promise<MovementRow> {
  return db.transaction(async (tx: Db) => {
    // Bloqueo por fila: serializa movimientos concurrentes del mismo producto
    const [locked] = await tx
      .select({ id: products.id, orgId: products.orgId })
      .from(products)
      .where(and(eq(products.id, input.productId), notDeleted(products)))
      .for("update");
    assertOwnedByOrg(locked, orgId);

    const stock = await getStock(tx, orgId, input.productId);
    const qtyMilli = parseQtyToMilli(input.qty);
    const isIn = input.kind === "in" || input.kind === "adjust_in";

    let newQty: bigint;
    let newAvg: bigint;
    let unitCost: bigint;

    if (isIn) {
      unitCost = input.unitCostCents ?? stock.avgCostCents;
      if (input.kind === "in" && input.unitCostCents === undefined) {
        throw new Error("Las entradas requieren costo unitario");
      }
      newQty = stock.qtyMilli + qtyMilli;
      newAvg = weightedAvgCents(
        stock.qtyMilli,
        stock.avgCostCents,
        qtyMilli,
        unitCost,
      );
    } else {
      if (qtyMilli > stock.qtyMilli) {
        throw new InsufficientStockError(
          milliToQtyString(stock.qtyMilli),
          milliToQtyString(qtyMilli),
        );
      }
      unitCost = stock.avgCostCents;
      newQty = stock.qtyMilli - qtyMilli;
      newAvg = newQty === 0n ? 0n : stock.avgCostCents;
    }

    const [row] = await tx
      .insert(inventoryMovements)
      .values({
        orgId,
        productId: input.productId,
        type: input.kind.startsWith("adjust")
          ? "adjustment"
          : (input.sourceType ?? "manual"),
        qty: (isIn ? "" : "-") + milliToQtyString(qtyMilli),
        unitCostBaseCents: unitCost,
        balanceQty: milliToQtyString(newQty),
        balanceAvgCostBaseCents: newAvg,
        sourceType: input.sourceType ?? "manual",
        sourceId: input.sourceId,
        lotId: input.lotId,
        note: input.note,
      })
      .returning();

    await logAudit(tx, {
      orgId,
      userId,
      entity: "inventory_movement",
      entityId: row.id,
      action: "create",
      after: { kind: input.kind, qty: input.qty, note: input.note },
    });
    return row;
  });
}

export async function listMovements(
  db: Db,
  orgId: string,
  productId: string,
): Promise<MovementRow[]> {
  await getOwnedProduct(db, orgId, productId);
  return db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.orgId, orgId),
        eq(inventoryMovements.productId, productId),
      ),
    )
    .orderBy(desc(inventoryMovements.seq));
}

/** Lista con el saldo actual de cada producto (para la tabla). */
export async function listProductsWithStock(
  db: Db,
  orgId: string,
  opts: { search?: string },
): Promise<Array<ProductRow & { balance: string; avg_cost_cents: string }>> {
  const searchClause = opts.search
    ? sql`and p.name ilike ${"%" + opts.search + "%"}`
    : sql``;
  const rows = await db.execute(sql`
    select p.*,
      coalesce(m.balance_qty, '0') as balance,
      coalesce(m.balance_avg_cost_base_cents, 0)::text as avg_cost_cents
    from products p
    left join lateral (
      select balance_qty, balance_avg_cost_base_cents from inventory_movements im
      where im.product_id = p.id and im.org_id = p.org_id
      order by im.seq desc limit 1
    ) m on true
    where p.org_id = ${orgId} and p.deleted_at is null ${searchClause}
    order by p.name
  `);
  return rows.rows ?? rows;
}

/** Productos cuyo saldo actual está por debajo de su stock mínimo. */
export async function lowStockProducts(
  db: Db,
  orgId: string,
): Promise<Array<ProductRow & { balance: string }>> {
  const rows = await db.execute(sql`
    select p.*, coalesce(m.balance_qty, '0') as balance
    from products p
    left join lateral (
      select balance_qty from inventory_movements im
      where im.product_id = p.id and im.org_id = p.org_id
      order by im.seq desc limit 1
    ) m on true
    where p.org_id = ${orgId}
      and p.deleted_at is null
      and coalesce(m.balance_qty, '0')::numeric < p.stock_min::numeric
  `);
  return rows.rows ?? rows;
}
