import { and, asc, desc, eq, ilike, sql as dsql } from "drizzle-orm";
import {
  suppliers,
  purchases,
  purchaseItems,
  supplierPayments,
  lots,
  documentSequences,
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

export type SupplierRow = typeof suppliers.$inferSelect;
export type PurchaseRow = typeof purchases.$inferSelect;
export type PurchaseItemRow = typeof purchaseItems.$inferSelect;
export type SupplierPaymentRow = typeof supplierPayments.$inferSelect;
export type LotRow = typeof lots.$inferSelect;

export type PurchaseItemInput = {
  productId?: string;
  description: string;
  qty: string;
  unitCostCents: bigint; // en la moneda del documento
  lotCode?: string;
  expiryDate?: string; // yyyy-mm-dd
};

export type PurchaseInput = {
  supplierId: string;
  currency: string;
  rateToBase: string;
  idempotencyKey: string;
  dueDate?: Date;
  items: PurchaseItemInput[];
};

// ---------- proveedores (patrón clientes) ----------

export async function createSupplier(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    name: string;
    taxId?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  },
): Promise<SupplierRow> {
  const [row] = await db
    .insert(suppliers)
    .values({ ...input, orgId })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "supplier",
    entityId: row.id,
    action: "create",
    after: { name: input.name },
  });
  return row;
}

export async function listSuppliers(
  db: Db,
  orgId: string,
  opts: { search?: string },
): Promise<SupplierRow[]> {
  const filters = [eq(suppliers.orgId, orgId), notDeleted(suppliers)];
  if (opts.search) filters.push(ilike(suppliers.name, `%${opts.search}%`));
  return db
    .select()
    .from(suppliers)
    .where(and(...filters))
    .orderBy(asc(suppliers.name));
}

async function getOwnedSupplier(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), notDeleted(suppliers)));
  return assertOwnedByOrg(row, orgId);
}

export async function updateSupplier(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: {
    name: string;
    taxId?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  },
): Promise<SupplierRow> {
  await getOwnedSupplier(db, orgId, id);
  const [row] = await db
    .update(suppliers)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(suppliers.id, id), eq(suppliers.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "supplier",
    entityId: id,
    action: "update",
    after: { name: input.name },
  });
  return row;
}

export async function softDeleteSupplier(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  await getOwnedSupplier(db, orgId, id);
  await db
    .update(suppliers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(suppliers.id, id), eq(suppliers.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "supplier",
    entityId: id,
    action: "delete",
  });
}

// ---------- compras ----------

export async function createPurchase(
  db: Db,
  orgId: string,
  userId: UserId,
  input: PurchaseInput,
): Promise<PurchaseRow> {
  if (input.items.length === 0) {
    throw new Error("La compra necesita al menos una línea");
  }
  const [existing] = await db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.orgId, orgId),
        eq(purchases.idempotencyKey, input.idempotencyKey),
      ),
    );
  if (existing) return existing;

  await getOwnedSupplier(db, orgId, input.supplierId);
  for (const item of input.items) {
    if (item.productId) await getOwnedProduct(db, orgId, item.productId);
  }

  const lines = input.items.map((item) => {
    const qtyMilli = parseQtyToMilli(item.qty);
    const totalCents = (qtyMilli * item.unitCostCents + 500n) / 1000n;
    return { ...item, totalCents };
  });
  const totalCents = lines.reduce((acc, l) => acc + l.totalCents, 0n);
  const totalBaseCents = convertToBase(totalCents, input.rateToBase);

  return db.transaction(async (tx: Db) => {
    const [purchase] = await tx
      .insert(purchases)
      .values({
        orgId,
        supplierId: input.supplierId,
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
    if (!purchase) {
      const [again] = await tx
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.orgId, orgId),
            eq(purchases.idempotencyKey, input.idempotencyKey),
          ),
        );
      return again;
    }
    for (const l of lines) {
      // lote (si la línea trae código): se crea/reusa ya, enlazado al item
      let lotId: string | undefined;
      if (l.productId && l.lotCode) {
        const [lot] = await tx
          .insert(lots)
          .values({
            orgId,
            productId: l.productId,
            code: l.lotCode,
            expiryDate: l.expiryDate ?? null,
          })
          .onConflictDoNothing()
          .returning();
        lotId =
          lot?.id ??
          (
            await tx
              .select()
              .from(lots)
              .where(
                and(
                  eq(lots.orgId, orgId),
                  eq(lots.productId, l.productId),
                  eq(lots.code, l.lotCode),
                ),
              )
          )[0]?.id;
      }
      await tx.insert(purchaseItems).values({
        orgId,
        purchaseId: purchase.id,
        productId: l.productId,
        lotId,
        description: l.description,
        qty: l.qty.replace(",", "."),
        unitCostCents: l.unitCostCents,
        totalCents: l.totalCents,
      });
    }
    await logAudit(tx, {
      orgId,
      userId,
      entity: "purchase",
      entityId: purchase.id,
      action: "create",
      after: { total: totalCents.toString(), currency: input.currency },
    });
    return purchase;
  });
}

async function getOwnedPurchase(
  db: Db,
  orgId: string,
  id: string,
): Promise<PurchaseRow> {
  const [row] = await db.select().from(purchases).where(eq(purchases.id, id));
  return assertOwnedByOrg(row, orgId);
}

/**
 * Confirmar: numera (secuencia purchase) y da ENTRADA al inventario con el
 * costo unitario CONVERTIDO A MONEDA BASE con la tasa fijada. Crea lotes si
 * la línea trae código. Una transacción; atómico.
 */
export async function confirmPurchase(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<PurchaseRow> {
  return db.transaction(async (tx: Db) => {
    const purchase = await getOwnedPurchase(tx, orgId, id);
    if (purchase.status !== "draft") {
      throw new Error("Solo se confirman compras en borrador");
    }
    const items: PurchaseItemRow[] = await tx
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseId, id));

    for (const item of items) {
      if (!item.productId) continue;
      // costo unitario en base con la tasa fijada del documento
      const unitCostBase = convertToBase(
        item.unitCostCents,
        purchase.rateToBaseFixed,
      );
      await registerMovement(tx, orgId, userId, {
        productId: item.productId,
        kind: "in",
        qty: item.qty,
        unitCostCents: unitCostBase,
        sourceType: "purchase",
        sourceId: id,
        lotId: item.lotId ?? undefined,
      });
    }

    const [seq] = await tx
      .select()
      .from(documentSequences)
      .where(
        and(
          eq(documentSequences.orgId, orgId),
          eq(documentSequences.docType, "purchase"),
          eq(documentSequences.series, purchase.series),
          eq(documentSequences.year, purchase.year),
        ),
      )
      .for("update");
    let number: number;
    if (!seq) {
      await tx.insert(documentSequences).values({
        orgId,
        docType: "purchase",
        series: purchase.series,
        year: purchase.year,
        nextNumber: 2,
      });
      number = 1;
    } else {
      await tx
        .update(documentSequences)
        .set({ nextNumber: seq.nextNumber + 1, updatedAt: new Date() })
        .where(eq(documentSequences.id, seq.id));
      number = seq.nextNumber;
    }

    const [updated] = await tx
      .update(purchases)
      .set({
        status: "confirmed",
        number,
        receivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchases.id, id))
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "purchase",
      entityId: id,
      action: "update",
      after: { status: "confirmed", number },
    });
    return updated;
  });
}

/** Cancelar: contramovimientos de salida por lo recibido. */
export async function cancelPurchase(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<PurchaseRow> {
  return db.transaction(async (tx: Db) => {
    const purchase = await getOwnedPurchase(tx, orgId, id);
    if (purchase.status === "cancelled") return purchase;
    if (purchase.status === "confirmed") {
      const items: PurchaseItemRow[] = await tx
        .select()
        .from(purchaseItems)
        .where(eq(purchaseItems.purchaseId, id));
      for (const item of items) {
        if (item.productId) {
          await registerMovement(tx, orgId, userId, {
            productId: item.productId,
            kind: "adjust_out",
            qty: item.qty,
            sourceType: "purchase",
            sourceId: id,
            note: `Cancelación compra ${purchase.series}-${purchase.number}`,
          });
        }
      }
    }
    const [updated] = await tx
      .update(purchases)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(purchases.id, id))
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "purchase",
      entityId: id,
      action: "cancel",
    });
    return updated;
  });
}

export async function getPurchaseDetail(
  db: Db,
  orgId: string,
  id: string,
): Promise<{
  purchase: PurchaseRow & { supplierName?: string };
  items: PurchaseItemRow[];
  payments: SupplierPaymentRow[];
  paidCents: bigint;
  balanceCents: bigint;
}> {
  const purchase = await getOwnedPurchase(db, orgId, id);
  const [meta] = await db
    .select({ supplierName: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, purchase.supplierId));
  const items = await db
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, id));
  const pays: SupplierPaymentRow[] = await db
    .select()
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.orgId, orgId),
        eq(supplierPayments.purchaseId, id),
      ),
    )
    .orderBy(desc(supplierPayments.paidAt));
  const paidCents = pays.reduce((acc, p) => acc + p.appliedCents, 0n);
  return {
    purchase: { ...purchase, ...meta },
    items,
    payments: pays,
    paidCents,
    balanceCents: purchase.totalCents - paidCents,
  };
}

export async function addSupplierPayment(
  db: Db,
  orgId: string,
  userId: UserId,
  purchaseId: string,
  input: {
    amountCents: bigint;
    currency: string;
    rateFixed: string;
    appliedCents: bigint;
    method?: string;
    note?: string;
  },
): Promise<SupplierPaymentRow> {
  return db.transaction(async (tx: Db) => {
    const detail = await getPurchaseDetail(tx, orgId, purchaseId);
    if (detail.purchase.status !== "confirmed") {
      throw new Error("Solo se paga sobre compras confirmadas");
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
      .insert(supplierPayments)
      .values({
        orgId,
        purchaseId,
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
      entity: "supplier_payment",
      entityId: row.id,
      action: "create",
      after: {
        amount: input.amountCents.toString(),
        currency: input.currency,
      },
    });
    return row;
  });
}

export async function listPurchases(
  db: Db,
  orgId: string,
): Promise<Array<PurchaseRow & { supplierName: string; paidCents: bigint }>> {
  const rows = await db
    .select({
      purchase: purchases,
      supplierName: suppliers.name,
      paid: dsql<string>`coalesce((select sum(sp.applied_cents) from supplier_payments sp where sp.purchase_id = ${purchases.id}), 0)`,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(eq(purchases.orgId, orgId))
    .orderBy(desc(purchases.createdAt));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    ...r.purchase,
    supplierName: r.supplierName,
    paidCents: BigInt(r.paid),
  }));
}

/** Compras confirmadas con saldo pendiente (CxP), vencidas primero. */
export async function accountsPayable(
  db: Db,
  orgId: string,
): Promise<
  Array<
    PurchaseRow & {
      supplierName: string;
      paidCents: bigint;
      balanceCents: bigint;
    }
  >
> {
  const all = await listPurchases(db, orgId);
  return all
    .filter((p) => p.status === "confirmed" && p.totalCents - p.paidCents > 0n)
    .map((p) => ({ ...p, balanceCents: p.totalCents - p.paidCents }))
    .sort((a, b) => {
      const da = a.dueDate?.getTime() ?? Infinity;
      const dbb = b.dueDate?.getTime() ?? Infinity;
      return da - dbb;
    });
}

export async function listLots(
  db: Db,
  orgId: string,
  productId: string,
): Promise<LotRow[]> {
  return db
    .select()
    .from(lots)
    .where(and(eq(lots.orgId, orgId), eq(lots.productId, productId)))
    .orderBy(asc(lots.expiryDate));
}
