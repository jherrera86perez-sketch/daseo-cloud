import { and, desc, eq, sql } from "drizzle-orm";
import {
  sales,
  saleItems,
  payments,
  documentSequences,
  customers,
} from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { convertToBase } from "@/lib/money";
import { parseQtyToMilli } from "@/lib/qty";
import {
  registerMovement,
  getOwnedProduct,
} from "@/features/inventory/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type SaleRow = typeof sales.$inferSelect;
export type SaleItemRow = typeof saleItems.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export type SaleItemInput = {
  productId?: string;
  description: string;
  qty: string;
  unitPriceCents: bigint;
};

export type SaleInput = {
  customerId: string;
  currency: string;
  rateToBase: string;
  idempotencyKey: string;
  dueDate?: Date;
  items: SaleItemInput[];
};

/**
 * Crea el borrador con totales calculados en servidor.
 * Regla multi-moneda: las líneas se suman en la moneda del documento y la
 * conversión a base ocurre UNA vez, sobre el total.
 */
export async function createSale(
  db: Db,
  orgId: string,
  userId: UserId,
  input: SaleInput,
): Promise<SaleRow> {
  if (input.items.length === 0) {
    throw new Error("La venta necesita al menos una línea");
  }
  // idempotencia: si el key ya existe, devolver la venta original
  const [existing] = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.orgId, orgId),
        eq(sales.idempotencyKey, input.idempotencyKey),
      ),
    );
  if (existing) {
    return existing;
  }

  // clientes y productos deben pertenecer a la org
  const [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, input.customerId), notDeleted(customers)));
  assertOwnedByOrg(cust, orgId);
  for (const item of input.items) {
    if (item.productId) {
      await getOwnedProduct(db, orgId, item.productId);
    }
  }

  const lines = input.items.map((item) => {
    const qtyMilli = parseQtyToMilli(item.qty);
    const totalCents = (qtyMilli * item.unitPriceCents + 500n) / 1000n;
    return { ...item, totalCents };
  });
  const totalCents = lines.reduce((acc, l) => acc + l.totalCents, 0n);
  const totalBaseCents = convertToBase(totalCents, input.rateToBase);

  return db.transaction(async (tx: Db) => {
    const [sale] = await tx
      .insert(sales)
      .values({
        orgId,
        customerId: input.customerId,
        year: new Date().getFullYear(),
        currency: input.currency,
        rateToBaseFixed: input.rateToBase.replace(",", "."),
        totalCents,
        totalBaseCents,
        dueDate: input.dueDate,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning();
    if (!sale) {
      // carrera de idempotencia: otro request lo creó primero
      const [again] = await tx
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.orgId, orgId),
            eq(sales.idempotencyKey, input.idempotencyKey),
          ),
        );
      return again;
    }
    await tx.insert(saleItems).values(
      lines.map((l) => ({
        orgId,
        saleId: sale.id,
        productId: l.productId,
        description: l.description,
        qty: l.qty.replace(",", "."),
        unitPriceCents: l.unitPriceCents,
        totalCents: l.totalCents,
      })),
    );
    await logAudit(tx, {
      orgId,
      userId,
      entity: "sale",
      entityId: sale.id,
      action: "create",
      after: { total: totalCents.toString(), currency: input.currency },
    });
    return sale;
  });
}

async function getOwnedSale(
  db: Db,
  orgId: string,
  id: string,
): Promise<SaleRow> {
  const [row] = await db.select().from(sales).where(eq(sales.id, id));
  return assertOwnedByOrg(row, orgId);
}

/** Siguiente número de la secuencia (org, tipo, serie, año) con FOR UPDATE. */
async function nextDocumentNumber(
  tx: Db,
  orgId: string,
  docType: string,
  series: string,
  year: number,
): Promise<number> {
  const [seq] = await tx
    .select()
    .from(documentSequences)
    .where(
      and(
        eq(documentSequences.orgId, orgId),
        eq(documentSequences.docType, docType),
        eq(documentSequences.series, series),
        eq(documentSequences.year, year),
      ),
    )
    .for("update");
  if (!seq) {
    await tx
      .insert(documentSequences)
      .values({ orgId, docType, series, year, nextNumber: 2 });
    return 1;
  }
  await tx
    .update(documentSequences)
    .set({ nextNumber: seq.nextNumber + 1, updatedAt: new Date() })
    .where(eq(documentSequences.id, seq.id));
  return seq.nextNumber;
}

/**
 * Confirma la venta: asigna número y descuenta inventario, todo en UNA
 * transacción — si falta stock de cualquier línea, nada se aplica.
 */
export async function confirmSale(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<SaleRow> {
  return db.transaction(async (tx: Db) => {
    const sale = await getOwnedSale(tx, orgId, id);
    if (sale.status !== "draft") {
      throw new Error("Solo se confirman ventas en borrador");
    }
    const items: SaleItemRow[] = await tx
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, id));
    for (const item of items) {
      if (item.productId) {
        await registerMovement(tx, orgId, userId, {
          productId: item.productId,
          kind: "out",
          qty: item.qty,
          sourceType: "sale",
          sourceId: id,
        });
      }
    }
    const number = await nextDocumentNumber(
      tx,
      orgId,
      "sale",
      sale.series,
      sale.year,
    );
    const [updated] = await tx
      .update(sales)
      .set({
        status: "confirmed",
        number,
        soldAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sales.id, id))
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "sale",
      entityId: id,
      action: "update",
      after: { status: "confirmed", number },
    });
    return updated;
  });
}

/** Cancela: contramovimientos de inventario (nunca se borra el documento). */
export async function cancelSale(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<SaleRow> {
  return db.transaction(async (tx: Db) => {
    const sale = await getOwnedSale(tx, orgId, id);
    if (sale.status === "cancelled") {
      return sale;
    }
    if (sale.status === "confirmed") {
      const items: SaleItemRow[] = await tx
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, id));
      for (const item of items) {
        if (item.productId) {
          await registerMovement(tx, orgId, userId, {
            productId: item.productId,
            kind: "adjust_in",
            qty: item.qty,
            sourceType: "sale",
            sourceId: id,
            note: `Cancelación venta ${sale.series}-${sale.number}`,
          });
        }
      }
    }
    const [updated] = await tx
      .update(sales)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(sales.id, id))
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "sale",
      entityId: id,
      action: "cancel",
    });
    return updated;
  });
}

export async function getSaleDetail(
  db: Db,
  orgId: string,
  id: string,
): Promise<{
  sale: SaleRow;
  items: SaleItemRow[];
  payments: PaymentRow[];
  paidCents: bigint;
  balanceCents: bigint;
}> {
  const sale = await getOwnedSale(db, orgId, id);
  const items = await db
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, id));
  const pays: PaymentRow[] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.saleId, id)))
    .orderBy(desc(payments.paidAt));
  const paidCents = pays.reduce((acc, p) => acc + p.appliedCents, 0n);
  return {
    sale,
    items,
    payments: pays,
    paidCents,
    balanceCents: sale.totalCents - paidCents,
  };
}

/** Registra un cobro; `appliedCents` es el equivalente en la moneda de la venta. */
export async function addPayment(
  db: Db,
  orgId: string,
  userId: UserId,
  saleId: string,
  input: {
    amountCents: bigint;
    currency: string;
    rateFixed: string;
    appliedCents: bigint;
    method?: string;
    note?: string;
  },
): Promise<PaymentRow> {
  return db.transaction(async (tx: Db) => {
    const detail = await getSaleDetail(tx, orgId, saleId);
    if (detail.sale.status !== "confirmed") {
      throw new Error("Solo se cobra sobre ventas confirmadas");
    }
    if (input.appliedCents <= 0n || input.amountCents <= 0n) {
      throw new Error("El pago debe ser positivo");
    }
    if (input.appliedCents > detail.balanceCents) {
      throw new Error(
        `El pago excede el saldo pendiente (${detail.balanceCents})`,
      );
    }
    const [row] = await tx
      .insert(payments)
      .values({
        orgId,
        saleId,
        amountCents: input.amountCents,
        currency: input.currency,
        rateFixed: input.rateFixed.replace(",", "."),
        appliedCents: input.appliedCents,
        method: input.method ?? "cash",
        note: input.note,
      })
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "payment",
      entityId: row.id,
      action: "create",
      after: {
        amount: input.amountCents.toString(),
        currency: input.currency,
        applied: input.appliedCents.toString(),
      },
    });
    return row;
  });
}

export async function listSales(
  db: Db,
  orgId: string,
): Promise<Array<SaleRow & { customerName: string; paidCents: bigint }>> {
  const rows = await db
    .select({
      sale: sales,
      customerName: customers.name,
      paid: sql<string>`coalesce((select sum(p.applied_cents) from payments p where p.sale_id = ${sales.id}), 0)`,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.orgId, orgId))
    .orderBy(desc(sales.createdAt));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    ...r.sale,
    customerName: r.customerName,
    paidCents: BigInt(r.paid),
  }));
}

/** Ventas confirmadas con saldo pendiente (CxC), vencidas primero. */
export async function accountsReceivable(
  db: Db,
  orgId: string,
): Promise<
  Array<
    SaleRow & { customerName: string; paidCents: bigint; balanceCents: bigint }
  >
> {
  const all = await listSales(db, orgId);
  return all
    .filter((s) => s.status === "confirmed" && s.totalCents - s.paidCents > 0n)
    .map((s) => ({ ...s, balanceCents: s.totalCents - s.paidCents }))
    .sort((a, b) => {
      const da = a.dueDate?.getTime() ?? Infinity;
      const dbb = b.dueDate?.getTime() ?? Infinity;
      return da - dbb;
    });
}
