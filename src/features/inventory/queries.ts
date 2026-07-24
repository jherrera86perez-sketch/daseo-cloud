import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { products, inventoryMovements } from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { parseQtyToMilli, milliToQtyString, weightedAvgCents } from "@/lib/qty";
import { parseDecimalToCents } from "@/lib/money";
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
  const { price, ...data } = productInputSchema.parse(input);
  const [row] = await db
    .insert(products)
    .values({
      ...data,
      priceCents: price ? parseDecimalToCents(price) : 0n,
      stockMin: data.stockMin?.replace(",", ".") ?? "0",
      orgId,
    })
    .returning();
  if (row.stockMinMode === "auto") {
    await applyAutoStockMin(db, orgId, row.id);
  }
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
  const { price, ...data } = productInputSchema.parse(input);
  const [row] = await db
    .update(products)
    .set({
      ...data,
      priceCents: price ? parseDecimalToCents(price) : 0n,
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
  if (row.stockMinMode === "auto") {
    await applyAutoStockMin(db, orgId, id);
  }
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
  // Dos pasos (en vez de `select p.*` crudo) para que Drizzle mapee las
  // columnas a camelCase de verdad — `.execute(sql\`select p.*...\`)` devuelve
  // snake_case tal cual lo declara Postgres, no lo que promete el tipo.
  const filters = [eq(products.orgId, orgId), notDeleted(products)];
  if (opts.search) filters.push(ilike(products.name, `%${opts.search}%`));
  const prods: ProductRow[] = await db
    .select()
    .from(products)
    .where(and(...filters))
    .orderBy(products.name);
  if (prods.length === 0) return [];

  const balRes = await db.execute(sql`
    select distinct on (im.product_id)
      im.product_id, im.balance_qty, im.balance_avg_cost_base_cents
    from inventory_movements im
    where im.org_id = ${orgId}
    order by im.product_id, im.seq desc
  `);
  const balRows = (balRes.rows ?? balRes) as Array<{
    product_id: string;
    balance_qty: string;
    balance_avg_cost_base_cents: string;
  }>;
  const balances = new Map(balRows.map((r) => [r.product_id, r]));

  return prods.map((p) => {
    const b = balances.get(p.id);
    return {
      ...p,
      balance: b?.balance_qty ?? "0",
      avg_cost_cents: b?.balance_avg_cost_base_cents ?? "0",
    };
  });
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

// ───────────── Paridad ERP: stock mínimo automático (ROP) ─────────────

export type ConsumptionAnalysis = {
  consumo30d: number;
  diario: number;
  diasConConsumo: number;
  datosSuficientes: boolean;
  sugerido: number;
  leadDays: number;
  safetyDays: number;
};

const MIN_DIAS_CON_CONSUMO = 7;

/**
 * Análisis de consumo del ERP: consumo neto de los últimos 30 días desde el
 * kardex (solo salidas reales `sale`/`production_out`; las reversiones caen
 * bajo type='adjustment' y quedan excluidas de forma natural) → sugerencia
 * de stock mínimo = consumo_diario_promedio × (leadDays + safetyDays).
 */
export async function consumptionAnalysis(
  db: Db,
  orgId: string,
  productId: string,
): Promise<ConsumptionAnalysis> {
  const product = await getOwnedProduct(db, orgId, productId);
  const res = await db.execute(sql`
    select
      coalesce(sum(abs(im.qty)), 0)::float as consumo,
      count(distinct date(im.created_at))::int as dias
    from inventory_movements im
    where im.org_id = ${orgId} and im.product_id = ${productId}
      and im.type in ('sale', 'production_out')
      and im.qty < 0
      and im.created_at >= now() - interval '30 days'
  `);
  const row = (res.rows ?? res)[0] as { consumo: number; dias: number };
  const diario = row.consumo / 30;
  const leadDays = product.leadDays;
  const safetyDays = product.safetyDays;
  return {
    consumo30d: row.consumo,
    diario,
    diasConConsumo: row.dias,
    datosSuficientes: row.dias >= MIN_DIAS_CON_CONSUMO,
    sugerido: Math.round(diario * (leadDays + safetyDays) * 1000) / 1000,
    leadDays,
    safetyDays,
  };
}

export type AutoStockMinResult = {
  applied: boolean;
  datosSuficientes: boolean;
  valorAnterior: string;
  valorNuevo: number | null;
};

/**
 * ERP POST /:id/recalcular-stock-minimo: si no hay datos suficientes (≥7
 * días con consumo en 30d) o el cambio es ≤0.01, no toca stock_min — solo
 * sella la fecha de cálculo.
 */
export async function applyAutoStockMin(
  db: Db,
  orgId: string,
  productId: string,
): Promise<AutoStockMinResult> {
  const product = await getOwnedProduct(db, orgId, productId);
  const analysis = await consumptionAnalysis(db, orgId, productId);
  const anterior = product.stockMin;
  if (!analysis.datosSuficientes) {
    await db
      .update(products)
      .set({ stockMinCalculatedAt: new Date() })
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)));
    return {
      applied: false,
      datosSuficientes: false,
      valorAnterior: anterior,
      valorNuevo: null,
    };
  }
  const cambioSignificativo =
    Math.abs(analysis.sugerido - Number(anterior)) > 0.01;
  if (!cambioSignificativo) {
    await db
      .update(products)
      .set({
        stockMinCalculated: String(analysis.sugerido),
        stockMinCalculatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)));
    return {
      applied: false,
      datosSuficientes: true,
      valorAnterior: anterior,
      valorNuevo: analysis.sugerido,
    };
  }
  await db
    .update(products)
    .set({
      stockMin: String(analysis.sugerido),
      stockMinCalculated: String(analysis.sugerido),
      stockMinCalculatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)));
  return {
    applied: true,
    datosSuficientes: true,
    valorAnterior: anterior,
    valorNuevo: analysis.sugerido,
  };
}

/** ERP POST /recalcular-stock-minimo-auto: bulk sobre modo 'auto'. */
export async function recalcularStockMinimoAuto(
  db: Db,
  orgId: string,
): Promise<{
  totalEvaluados: number;
  actualizados: number;
  sinCambios: number;
  sinDatos: number;
}> {
  const rows: ProductRow[] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.orgId, orgId),
        eq(products.stockMinMode, "auto"),
        notDeleted(products),
      ),
    );
  let actualizados = 0;
  let sinCambios = 0;
  let sinDatos = 0;
  for (const p of rows) {
    const r = await applyAutoStockMin(db, orgId, p.id);
    if (!r.datosSuficientes) sinDatos++;
    else if (r.applied) actualizados++;
    else sinCambios++;
  }
  return {
    totalEvaluados: rows.length,
    actualizados,
    sinCambios,
    sinDatos,
  };
}

// ───────────── Paridad ERP: alertas de stock bajo con cascada ─────────────

export type LowStockAlert = {
  productId: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  urgencia: "CRITICA" | "ALTA" | "MEDIA";
  necesitaReabastecimiento: boolean;
  productosAfectados: Array<{
    recipeName: string;
    finalProductName: string;
    batchesProducibles: number;
  }>;
};

export type LowStockSummary = {
  alerts: LowStockAlert[];
  total: number;
  criticalCount: number;
  summary: { criticos: number; altaUrgencia: number; mediaUrgencia: number };
};

/**
 * GET /inventario/alerts/stock del ERP: solo productos con stock_minimo>0,
 * urgencia por % del mínimo, y cascada — para insumos, qué productos finales
 * (receta activa) dependen y cuántos lotes son producibles con el stock hoy.
 */
export async function lowStockAlerts(
  db: Db,
  orgId: string,
): Promise<LowStockSummary> {
  type Row = {
    id: string;
    name: string;
    is_component: boolean;
    stock_min: string;
    balance: string;
  };
  const res = await db.execute(sql`
      select p.id, p.name, p.is_component, p.stock_min,
        coalesce(m.balance_qty, '0') as balance
      from products p
      left join lateral (
        select balance_qty from inventory_movements im
        where im.product_id = p.id and im.org_id = p.org_id
        order by im.seq desc limit 1
      ) m on true
      where p.org_id = ${orgId}
        and p.deleted_at is null
        and p.stock_min::numeric > 0
        and coalesce(m.balance_qty, '0')::numeric < p.stock_min::numeric
    `);
  const rows = (res.rows ?? res) as Row[];

  const alerts: LowStockAlert[] = [];
  for (const p of rows) {
    const stockActual = Number(p.balance);
    const stockMinimo = Number(p.stock_min);
    const pct = stockMinimo > 0 ? stockActual / stockMinimo : 0;
    const urgencia =
      stockActual <= 0 ? "CRITICA" : pct < 0.5 ? "ALTA" : "MEDIA";

    let productosAfectados: LowStockAlert["productosAfectados"] = [];
    if (p.is_component) {
      const cascada = await db.execute(sql`
        select r.name as recipe_name, fp.name as final_product_name, ri.qty as qty_por_lote
        from recipe_items ri
        join recipes r on r.id = ri.recipe_id and r.deleted_at is null
        join products fp on fp.id = r.product_id and fp.deleted_at is null
        where ri.org_id = ${orgId} and ri.product_id = ${p.id}
      `);
      const cascadaRows = (cascada.rows ?? cascada) as Array<{
        recipe_name: string;
        final_product_name: string;
        qty_por_lote: string;
      }>;
      productosAfectados = cascadaRows.map((c) => ({
        recipeName: c.recipe_name,
        finalProductName: c.final_product_name,
        batchesProducibles: Math.floor(stockActual / Number(c.qty_por_lote)),
      }));
    }

    alerts.push({
      productId: p.id,
      nombre: p.name,
      stockActual,
      stockMinimo,
      urgencia,
      necesitaReabastecimiento: stockActual <= 0,
      productosAfectados,
    });
  }

  return {
    alerts,
    total: alerts.length,
    criticalCount: alerts.filter((a) => a.urgencia === "CRITICA").length,
    summary: {
      criticos: alerts.filter((a) => a.urgencia === "CRITICA").length,
      altaUrgencia: alerts.filter((a) => a.urgencia === "ALTA").length,
      mediaUrgencia: alerts.filter((a) => a.urgencia === "MEDIA").length,
    },
  };
}

// ───────────── Paridad ERP: valor de inventario a fecha de corte ─────────────

export type InventoryValueRow = {
  productId: string;
  nombre: string;
  saldoCantidad: number;
  costoPromedioCents: bigint;
  saldoValorCents: bigint;
};

/**
 * GET /inventario/kardex-valor-inventario del ERP: valor de inventario a una
 * fecha de corte usando el ÚLTIMO movimiento de cada producto hasta esa fecha.
 */
export async function inventoryValueAtDate(
  db: Db,
  orgId: string,
  cutoff: Date,
): Promise<{
  fechaCorte: string;
  productos: InventoryValueRow[];
  totales: {
    totalProductos: number;
    totalUnidades: number;
    totalValorCents: bigint;
  };
}> {
  const res = await db.execute(sql`
    select distinct on (im.product_id)
      im.product_id, p.name, im.balance_qty, im.balance_avg_cost_base_cents
    from inventory_movements im
    join products p on p.id = im.product_id
    where im.org_id = ${orgId} and im.created_at <= ${cutoff.toISOString()}::timestamptz
    order by im.product_id, im.seq desc
  `);
  const rows = (res.rows ?? res) as Array<{
    product_id: string;
    name: string;
    balance_qty: string;
    balance_avg_cost_base_cents: string;
  }>;
  const productos: InventoryValueRow[] = rows.map((r) => ({
    productId: r.product_id,
    nombre: r.name,
    saldoCantidad: Number(r.balance_qty),
    costoPromedioCents: BigInt(r.balance_avg_cost_base_cents),
    saldoValorCents:
      (BigInt(Math.round(Number(r.balance_qty) * 1000)) *
        BigInt(r.balance_avg_cost_base_cents)) /
      1000n,
  }));
  return {
    fechaCorte: cutoff.toISOString().slice(0, 10),
    productos,
    totales: {
      totalProductos: productos.length,
      totalUnidades: productos.reduce((s, p) => s + p.saldoCantidad, 0),
      totalValorCents: productos.reduce((s, p) => s + p.saldoValorCents, 0n),
    },
  };
}
