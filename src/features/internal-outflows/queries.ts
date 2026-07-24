import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  internalOutflows,
  internalOutflowItems,
  bankMovements,
  employees,
} from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { parseQtyToMilli, milliToQtyString } from "@/lib/qty";
import {
  registerMovement,
  getOwnedProduct,
  getStock,
} from "@/features/inventory/queries";
import { getOwnedAccount } from "@/features/banking/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type OutflowRow = typeof internalOutflows.$inferSelect;
export type OutflowItemRow = typeof internalOutflowItems.$inferSelect;
export type OutflowWithItems = OutflowRow & {
  empleadoNombre: string | null;
  items: OutflowItemRow[];
};

/** Tipos válidos del ERP (inventario.js:40). */
export const TIPOS_SALIDA_INTERNA = [
  "DONACION",
  "REGALO",
  "AUTOCONSUMO",
  "TRABAJADORES",
] as const;
export type TipoSalidaInterna = (typeof TIPOS_SALIDA_INTERNA)[number];

/** Categoría bancaria por tipo (inventario.js:114-116). */
export function categoriaBancaria(tipo: string): string {
  if (tipo === "TRABAJADORES") return "Aseo/Protección al trabajador";
  if (tipo === "DONACION") return "Donaciones";
  if (tipo === "REGALO") return "Regalos";
  return "Autoconsumo";
}

export type OutflowInput = {
  fecha: string; // YYYY-MM-DD
  tipo: string;
  destinoNombre?: string | null;
  employeeId?: string | null;
  montoEfectivoCents: bigint;
  bankAccountId?: string | null;
  motivo?: string | null;
  notas?: string | null;
  items: Array<{ productId: string; qty: string }>;
};

/**
 * Validaciones del ERP con sus mensajes LITERALES (parseSalidaBody,
 * inventario.js:52-80). Lanza Error con el texto exacto.
 */
function validateInput(input: OutflowInput): void {
  if (!TIPOS_SALIDA_INTERNA.includes(input.tipo as TipoSalidaInterna)) {
    throw new Error(
      "tipo inválido (DONACION | REGALO | AUTOCONSUMO | TRABAJADORES)",
    );
  }
  for (const line of input.items) {
    if (!line.productId) {
      throw new Error("Cada línea debe tener un producto seleccionado");
    }
    if (!(Number(line.qty) > 0)) {
      throw new Error("La cantidad de cada producto debe ser mayor que 0");
    }
  }
  if (input.montoEfectivoCents < 0n) {
    throw new Error("El monto en efectivo no puede ser negativo");
  }
  if (input.items.length === 0 && input.montoEfectivoCents <= 0n) {
    throw new Error("Registra al menos un producto o un monto en efectivo");
  }
}

/**
 * Crea la salida DENTRO de una transacción abierta (equivale a
 * crearSalidaInternaTx del ERP): valida stock AGREGADO por producto,
 * registra el egreso bancario si hay efectivo, descuenta stock vía kardex
 * (costo promedio) y congela costos en el detalle.
 */
async function createOutflowTx(
  tx: Db,
  orgId: string,
  userId: UserId,
  input: OutflowInput,
): Promise<OutflowRow> {
  // Stock agregado por producto: líneas duplicadas se suman (inventario.js:90-104)
  const totalPorProducto = new Map<string, bigint>();
  for (const line of input.items) {
    const prev = totalPorProducto.get(line.productId) ?? 0n;
    totalPorProducto.set(line.productId, prev + parseQtyToMilli(line.qty));
  }
  const productos = new Map<
    string,
    Awaited<ReturnType<typeof getOwnedProduct>>
  >();
  for (const [productId, requerido] of totalPorProducto) {
    const p = await getOwnedProduct(tx, orgId, productId);
    productos.set(productId, p);
    const stock = await getStock(tx, orgId, productId);
    if (stock.qtyMilli < requerido) {
      throw new Error(
        `Stock insuficiente de "${p.name}" (disponible ${milliToQtyString(stock.qtyMilli)}, requerido ${milliToQtyString(requerido)})`,
      );
    }
  }

  const efectivo = input.montoEfectivoCents;
  if (efectivo > 0n && !input.bankAccountId) {
    // Adaptación multi-cuenta: el ERP tiene un solo consolidado bancario
    throw new Error("Selecciona la cuenta bancaria para el egreso en efectivo");
  }

  const [outflow] = await tx
    .insert(internalOutflows)
    .values({
      orgId,
      fecha: input.fecha,
      tipo: input.tipo,
      destinoNombre: input.destinoNombre ?? null,
      employeeId: input.employeeId ?? null,
      montoEfectivoCents: efectivo,
      valorProductosCents: 0n,
      bankAccountId: efectivo > 0n ? input.bankAccountId : null,
      motivo: input.motivo ?? null,
      notas: input.notas ?? null,
    })
    .returning();

  // Egreso bancario (inventario.js:106-136): excluido de conciliación
  // pendiente en el ERP (origen='salida_interna') → aquí status 'ignored'.
  if (efectivo > 0n && input.bankAccountId) {
    await getOwnedAccount(tx, orgId, input.bankAccountId);
    const destino = input.destinoNombre?.trim();
    const [mov] = await tx
      .insert(bankMovements)
      .values({
        orgId,
        bankAccountId: input.bankAccountId,
        movementDate: input.fecha,
        description: `${categoriaBancaria(input.tipo)}${destino ? ` — ${destino}` : ""}`,
        amountCents: -efectivo,
        reference: `SAL-${outflow.id}`,
        dedupHash: `salida_interna_${outflow.id}`,
        status: "ignored",
      })
      .returning();
    await tx
      .update(internalOutflows)
      .set({ bankMovementId: mov.id })
      .where(eq(internalOutflows.id, outflow.id));
    outflow.bankMovementId = mov.id;
  }

  // Líneas: descuenta stock al CREAR, costo = promedio del kardex
  let valorProductos = 0n;
  for (const line of input.items) {
    const p = productos.get(line.productId)!;
    const mov = await registerMovement(tx, orgId, userId, {
      productId: line.productId,
      kind: "out",
      qty: line.qty,
      sourceType: "internal_use",
      sourceId: outflow.id,
      note: `${input.tipo} - ${input.destinoNombre ?? ""}`.trim(),
    });
    const unitCost = mov.unitCostBaseCents ?? 0n;
    // costo_total = cantidad × costo (el ERP redondea a 4 decimales)
    const totalCost = (parseQtyToMilli(line.qty) * unitCost + 500n) / 1000n;
    valorProductos += totalCost;
    await tx.insert(internalOutflowItems).values({
      orgId,
      outflowId: outflow.id,
      productId: line.productId,
      productName: p.name,
      qty: line.qty,
      unit: p.unit,
      unitCostCents: unitCost,
      totalCostCents: totalCost,
    });
  }

  const [updated] = await tx
    .update(internalOutflows)
    .set({ valorProductosCents: valorProductos })
    .where(eq(internalOutflows.id, outflow.id))
    .returning();
  return updated;
}

/**
 * Reversión íntegra DENTRO de una transacción (revertirSalidaInternaTx):
 * devuelve stock con entrada al costo congelado, borra el egreso bancario
 * y elimina detalle + cabecera.
 */
async function revertOutflowTx(
  tx: Db,
  orgId: string,
  userId: UserId,
  outflow: OutflowRow,
  items: OutflowItemRow[],
): Promise<void> {
  for (const item of items) {
    await registerMovement(tx, orgId, userId, {
      productId: item.productId,
      kind: "in",
      qty: item.qty,
      unitCostCents: item.unitCostCents,
      sourceType: "internal_use",
      sourceId: outflow.id,
      note: `Reversión de salida interna SAL-${outflow.id}`,
    });
  }
  if (outflow.bankMovementId) {
    await tx
      .delete(bankMovements)
      .where(
        and(
          eq(bankMovements.id, outflow.bankMovementId),
          eq(bankMovements.orgId, orgId),
        ),
      );
  }
  await tx
    .delete(internalOutflowItems)
    .where(eq(internalOutflowItems.outflowId, outflow.id));
  await tx.delete(internalOutflows).where(eq(internalOutflows.id, outflow.id));
}

export async function createInternalOutflow(
  db: Db,
  orgId: string,
  userId: UserId,
  input: OutflowInput,
): Promise<OutflowRow> {
  validateInput(input);
  const row: OutflowRow = await db.transaction((tx: Db) =>
    createOutflowTx(tx, orgId, userId, input),
  );
  await logAudit(db, {
    orgId,
    userId,
    entity: "internal_outflow",
    entityId: row.id,
    action: "create",
    after: {
      tipo: input.tipo,
      efectivoCents: input.montoEfectivoCents.toString(),
      items: input.items.length,
    },
  });
  return row;
}

async function getOwnedOutflow(
  db: Db,
  orgId: string,
  id: string,
): Promise<{ outflow: OutflowRow; items: OutflowItemRow[] }> {
  const [row] = await db
    .select()
    .from(internalOutflows)
    .where(eq(internalOutflows.id, id));
  const outflow = assertOwnedByOrg(row, orgId);
  if (!outflow) throw new Error("Salida no encontrada");
  const items: OutflowItemRow[] = await db
    .select()
    .from(internalOutflowItems)
    .where(eq(internalOutflowItems.outflowId, id));
  return { outflow, items };
}

export async function deleteInternalOutflow(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  const { outflow, items } = await getOwnedOutflow(db, orgId, id);
  await db.transaction((tx: Db) =>
    revertOutflowTx(tx, orgId, userId, outflow, items),
  );
  await logAudit(db, {
    orgId,
    userId,
    entity: "internal_outflow",
    entityId: id,
    action: "delete",
    after: { tipo: outflow.tipo },
  });
}

/**
 * Editar = revertir + recrear en UNA transacción (PUT del ERP,
 * inventario.js:315-342). Re-numera: devuelve una salida con id nuevo.
 */
export async function updateInternalOutflow(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: OutflowInput,
): Promise<OutflowRow> {
  validateInput(input);
  const { outflow, items } = await getOwnedOutflow(db, orgId, id);
  const row: OutflowRow = await db.transaction(async (tx: Db) => {
    await revertOutflowTx(tx, orgId, userId, outflow, items);
    return createOutflowTx(tx, orgId, userId, input);
  });
  await logAudit(db, {
    orgId,
    userId,
    entity: "internal_outflow",
    entityId: row.id,
    action: "update",
    after: { editadaDe: id, tipo: input.tipo },
  });
  return row;
}

/** Listado con rango de fechas inclusivo (GET del ERP, inventario.js:247-284). */
export async function listInternalOutflows(
  db: Db,
  orgId: string,
  opts: { desde?: string; hasta?: string },
): Promise<OutflowWithItems[]> {
  const filters = [eq(internalOutflows.orgId, orgId)];
  if (opts.desde) filters.push(gte(internalOutflows.fecha, opts.desde));
  if (opts.hasta) filters.push(lte(internalOutflows.fecha, opts.hasta));
  const rows: Array<OutflowRow & { empleadoNombre: string | null }> = (
    await db
      .select({
        outflow: internalOutflows,
        empleadoNombre: employees.name,
      })
      .from(internalOutflows)
      .leftJoin(employees, eq(employees.id, internalOutflows.employeeId))
      .where(and(...filters))
      .orderBy(desc(internalOutflows.fecha), desc(internalOutflows.createdAt))
  ).map((r: { outflow: OutflowRow; empleadoNombre: string | null }) => ({
    ...r.outflow,
    empleadoNombre: r.empleadoNombre,
  }));

  if (rows.length === 0) return [];
  const items: OutflowItemRow[] = await db
    .select()
    .from(internalOutflowItems)
    .where(
      inArray(
        internalOutflowItems.outflowId,
        rows.map((r) => r.id),
      ),
    );
  const porSalida = new Map<string, OutflowItemRow[]>();
  for (const item of items) {
    const list = porSalida.get(item.outflowId) ?? [];
    list.push(item);
    porSalida.set(item.outflowId, list);
  }
  return rows.map((r) => ({ ...r, items: porSalida.get(r.id) ?? [] }));
}
