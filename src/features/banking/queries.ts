import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  bankAccounts,
  bankMovements,
  payments,
  supplierPayments,
  sales,
  customers,
  purchases,
  suppliers,
} from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import type { BankCsvRow } from "@/lib/bank-csv";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type BankAccountRow = typeof bankAccounts.$inferSelect;
export type BankMovementRow = typeof bankMovements.$inferSelect;

export async function createBankAccount(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    name: string;
    currency: string;
    bank?: string;
    accountNumber?: string;
  },
): Promise<BankAccountRow> {
  const [row] = await db
    .insert(bankAccounts)
    .values({ ...input, orgId })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "bank_account",
    entityId: row.id,
    action: "create",
    after: { name: input.name, currency: input.currency },
  });
  return row;
}

export async function listBankAccounts(
  db: Db,
  orgId: string,
): Promise<BankAccountRow[]> {
  return db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.orgId, orgId), notDeleted(bankAccounts)))
    .orderBy(asc(bankAccounts.name));
}

export async function getOwnedAccount(
  db: Db,
  orgId: string,
  id: string,
): Promise<BankAccountRow> {
  const [row] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), notDeleted(bankAccounts)));
  return assertOwnedByOrg(row, orgId);
}

function dedupHash(accountId: string, r: BankCsvRow): string {
  return createHash("sha256")
    .update(
      `${accountId}|${r.date}|${r.amountCents}|${r.description}|${r.reference ?? ""}`,
    )
    .digest("hex")
    .slice(0, 32);
}

/** Inserta movimientos nuevos; los repetidos (mismo hash) se cuentan como duplicados. */
export async function importMovements(
  db: Db,
  orgId: string,
  userId: UserId,
  accountId: string,
  rows: BankCsvRow[],
): Promise<{ inserted: number; duplicates: number }> {
  await getOwnedAccount(db, orgId, accountId);
  let inserted = 0;
  let duplicates = 0;
  for (const r of rows) {
    const [row] = await db
      .insert(bankMovements)
      .values({
        orgId,
        bankAccountId: accountId,
        movementDate: r.date,
        description: r.description,
        amountCents: r.amountCents,
        reference: r.reference,
        dedupHash: dedupHash(accountId, r),
      })
      .onConflictDoNothing()
      .returning();
    if (row) inserted++;
    else duplicates++;
  }
  await logAudit(db, {
    orgId,
    userId,
    entity: "bank_import",
    entityId: accountId,
    action: "create",
    after: { inserted, duplicates },
  });
  return { inserted, duplicates };
}

export async function listMovements(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<BankMovementRow[]> {
  await getOwnedAccount(db, orgId, accountId);
  return db
    .select()
    .from(bankMovements)
    .where(
      and(
        eq(bankMovements.orgId, orgId),
        eq(bankMovements.bankAccountId, accountId),
      ),
    )
    .orderBy(desc(bankMovements.movementDate), desc(bankMovements.createdAt));
}

export type MatchSuggestion = {
  kind: "payment" | "supplier_payment";
  paymentId: string;
  score: number;
  label: string;
  amountCents: bigint;
  paidAt: Date;
};

/**
 * Sugerencias de conciliación al estilo CubaOne (banco_match_score):
 * +2 monto exacto · +1 método transferencia · +1 fecha a ≤3 días.
 * Ingresos (+) buscan cobros de ventas; egresos (−) pagos a proveedores.
 */
export async function matchSuggestions(
  db: Db,
  orgId: string,
  movementId: string,
): Promise<MatchSuggestion[]> {
  const [movement] = await db
    .select()
    .from(bankMovements)
    .where(eq(bankMovements.id, movementId));
  assertOwnedByOrg(movement, orgId);
  const target =
    movement.amountCents > 0n ? movement.amountCents : -movement.amountCents;
  const suggestions: MatchSuggestion[] = [];

  if (movement.amountCents > 0n) {
    const rows = await db
      .select({
        pay: payments,
        saleNumber: sales.number,
        saleSeries: sales.series,
        customerName: customers.name,
      })
      .from(payments)
      .innerJoin(sales, eq(payments.saleId, sales.id))
      .innerJoin(customers, eq(sales.customerId, customers.id))
      .where(and(eq(payments.orgId, orgId), isNull(payments.bankAccountId)));
    for (const r of rows) {
      const score = scoreMatch(r.pay, target, movement.movementDate);
      if (score > 0) {
        suggestions.push({
          kind: "payment",
          paymentId: r.pay.id,
          score,
          label: `${r.saleSeries}-${r.saleNumber} · ${r.customerName}`,
          amountCents: r.pay.amountCents,
          paidAt: r.pay.paidAt,
        });
      }
    }
  } else {
    const rows = await db
      .select({
        pay: supplierPayments,
        number: purchases.number,
        series: purchases.series,
        supplierName: suppliers.name,
      })
      .from(supplierPayments)
      .innerJoin(purchases, eq(supplierPayments.purchaseId, purchases.id))
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .where(
        and(
          eq(supplierPayments.orgId, orgId),
          isNull(supplierPayments.bankAccountId),
        ),
      );
    for (const r of rows) {
      const score = scoreMatch(r.pay, target, movement.movementDate);
      if (score > 0) {
        suggestions.push({
          kind: "supplier_payment",
          paymentId: r.pay.id,
          score,
          label: `${r.series}-${r.number} · ${r.supplierName}`,
          amountCents: r.pay.amountCents,
          paidAt: r.pay.paidAt,
        });
      }
    }
  }
  return suggestions.sort((a, b) => b.score - a.score);
}

function scoreMatch(
  pay: { amountCents: bigint; method: string; paidAt: Date },
  target: bigint,
  movementDate: string,
): number {
  let score = 0;
  if (pay.amountCents === target) score += 2;
  else return 0; // sin monto exacto no sugerimos (evita ruido)
  if (pay.method === "transfer") score += 1;
  const dayMs = 24 * 3600 * 1000;
  const diff = Math.abs(
    new Date(movementDate).getTime() - pay.paidAt.getTime(),
  );
  if (diff <= 3 * dayMs) score += 1;
  return score;
}

/** Vincula el movimiento con un cobro o pago; marca ambos lados. */
export async function linkMovement(
  db: Db,
  orgId: string,
  userId: UserId,
  movementId: string,
  target: { paymentId?: string; supplierPaymentId?: string },
): Promise<BankMovementRow> {
  return db.transaction(async (tx: Db) => {
    const [movement] = await tx
      .select()
      .from(bankMovements)
      .where(eq(bankMovements.id, movementId));
    assertOwnedByOrg(movement, orgId);
    if (movement.status !== "pending") {
      throw new Error("El movimiento ya fue conciliado o ignorado");
    }
    if (target.paymentId) {
      const [pay] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, target.paymentId));
      assertOwnedByOrg(pay, orgId);
      await tx
        .update(payments)
        .set({ bankAccountId: movement.bankAccountId })
        .where(eq(payments.id, target.paymentId));
    } else if (target.supplierPaymentId) {
      const [pay] = await tx
        .select()
        .from(supplierPayments)
        .where(eq(supplierPayments.id, target.supplierPaymentId));
      assertOwnedByOrg(pay, orgId);
      await tx
        .update(supplierPayments)
        .set({ bankAccountId: movement.bankAccountId })
        .where(eq(supplierPayments.id, target.supplierPaymentId));
    } else {
      throw new Error("Falta el cobro o pago a vincular");
    }
    const [updated] = await tx
      .update(bankMovements)
      .set({
        status: "matched",
        matchedPaymentId: target.paymentId,
        matchedSupplierPaymentId: target.supplierPaymentId,
      })
      .where(eq(bankMovements.id, movementId))
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "bank_movement",
      entityId: movementId,
      action: "update",
      after: { status: "matched", ...target },
    });
    return updated;
  });
}

export async function ignoreMovement(
  db: Db,
  orgId: string,
  userId: UserId,
  movementId: string,
): Promise<BankMovementRow> {
  const [movement] = await db
    .select()
    .from(bankMovements)
    .where(eq(bankMovements.id, movementId));
  assertOwnedByOrg(movement, orgId);
  const [updated] = await db
    .update(bankMovements)
    .set({ status: "ignored" })
    .where(eq(bankMovements.id, movementId))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "bank_movement",
    entityId: movementId,
    action: "update",
    after: { status: "ignored" },
  });
  return updated;
}
