import { and, desc, eq } from "drizzle-orm";
import {
  quotes,
  quoteItems,
  customers,
  documentSequences,
  pipelineStages,
} from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { convertToBase } from "@/lib/money";
import { parseQtyToMilli } from "@/lib/qty";
import { createSale } from "@/features/sales/queries";
import { moveDeal } from "@/features/pipeline/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type QuoteRow = typeof quotes.$inferSelect;
export type QuoteItemRow = typeof quoteItems.$inferSelect;

export type QuoteInput = {
  customerId: string;
  dealId?: string;
  currency: string;
  rateToBase: string;
  validUntil?: Date;
  items: Array<{
    productId?: string;
    description: string;
    qty: string;
    unitPriceCents: bigint;
  }>;
};

/** Las cotizaciones se numeran al crearse (no son documento fiscal). */
export async function createQuote(
  db: Db,
  orgId: string,
  userId: UserId,
  input: QuoteInput,
): Promise<QuoteRow> {
  if (input.items.length === 0) {
    throw new Error("La cotización necesita al menos una línea");
  }
  const [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, input.customerId), notDeleted(customers)));
  assertOwnedByOrg(cust, orgId);

  const lines = input.items.map((item) => {
    const qtyMilli = parseQtyToMilli(item.qty);
    const totalCents = (qtyMilli * item.unitPriceCents + 500n) / 1000n;
    return { ...item, totalCents };
  });
  const totalCents = lines.reduce((acc, l) => acc + l.totalCents, 0n);
  const totalBaseCents = convertToBase(totalCents, input.rateToBase);
  const year = new Date().getFullYear();

  return db.transaction(async (tx: Db) => {
    const [seq] = await tx
      .select()
      .from(documentSequences)
      .where(
        and(
          eq(documentSequences.orgId, orgId),
          eq(documentSequences.docType, "quote"),
          eq(documentSequences.series, "A"),
          eq(documentSequences.year, year),
        ),
      )
      .for("update");
    let number: number;
    if (!seq) {
      await tx
        .insert(documentSequences)
        .values({ orgId, docType: "quote", series: "A", year, nextNumber: 2 });
      number = 1;
    } else {
      await tx
        .update(documentSequences)
        .set({ nextNumber: seq.nextNumber + 1, updatedAt: new Date() })
        .where(eq(documentSequences.id, seq.id));
      number = seq.nextNumber;
    }
    const [quote] = await tx
      .insert(quotes)
      .values({
        orgId,
        customerId: input.customerId,
        dealId: input.dealId,
        year,
        number,
        currency: input.currency,
        rateToBaseFixed: input.rateToBase.replace(",", "."),
        totalCents,
        totalBaseCents,
        validUntil: input.validUntil,
      })
      .returning();
    await tx.insert(quoteItems).values(
      lines.map((l) => ({
        orgId,
        quoteId: quote.id,
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
      entity: "quote",
      entityId: quote.id,
      action: "create",
      after: { total: totalCents.toString(), currency: input.currency },
    });
    return quote;
  });
}

async function getOwnedQuote(
  db: Db,
  orgId: string,
  id: string,
): Promise<QuoteRow> {
  const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
  return assertOwnedByOrg(row, orgId);
}

async function setStatus(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  from: string[],
  to: string,
): Promise<QuoteRow> {
  const quote = await getOwnedQuote(db, orgId, id);
  if (!from.includes(quote.status)) {
    throw new Error(`Transición inválida: ${quote.status} → ${to}`);
  }
  const [updated] = await db
    .update(quotes)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "quote",
    entityId: id,
    action: "update",
    after: { status: to },
  });
  return updated;
}

export async function sendQuote(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
) {
  return setStatus(db, orgId, userId, id, ["draft"], "sent");
}

export async function rejectQuote(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
) {
  return setStatus(db, orgId, userId, id, ["draft", "sent"], "rejected");
}

/**
 * Aceptar = una transacción: venta borrador con las mismas líneas + deal
 * vinculado movido a la etapa ganadora.
 */
export async function acceptQuote(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<{ quote: QuoteRow; saleId: string }> {
  return db.transaction(async (tx: Db) => {
    const quote = await setStatus(
      tx,
      orgId,
      userId,
      id,
      ["draft", "sent"],
      "accepted",
    );
    const items: QuoteItemRow[] = await tx
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id));
    const sale = await createSale(tx, orgId, userId, {
      customerId: quote.customerId,
      currency: quote.currency,
      rateToBase: quote.rateToBaseFixed,
      idempotencyKey: quote.id, // la cotización solo puede generar UNA venta
      items: items.map((i) => ({
        productId: i.productId ?? undefined,
        description: i.description,
        qty: i.qty,
        unitPriceCents: i.unitPriceCents,
      })),
    });
    if (quote.dealId) {
      const [wonStage] = await tx
        .select()
        .from(pipelineStages)
        .where(
          and(eq(pipelineStages.orgId, orgId), eq(pipelineStages.isWon, true)),
        );
      if (wonStage) {
        await moveDeal(tx, orgId, userId, quote.dealId, wonStage.id);
      }
    }
    return { quote, saleId: sale.id };
  });
}

export async function getQuoteDetail(
  db: Db,
  orgId: string,
  id: string,
): Promise<{ quote: QuoteRow; items: QuoteItemRow[] }> {
  const quote = await getOwnedQuote(db, orgId, id);
  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, id));
  return { quote, items };
}

export async function listQuotes(
  db: Db,
  orgId: string,
): Promise<Array<QuoteRow & { customerName: string }>> {
  const rows = await db
    .select({ quote: quotes, customerName: customers.name })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .where(eq(quotes.orgId, orgId))
    .orderBy(desc(quotes.createdAt));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ ...r.quote, customerName: r.customerName }));
}
