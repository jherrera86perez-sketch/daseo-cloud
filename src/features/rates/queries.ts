import { and, desc, eq } from "drizzle-orm";
import { exchangeRates } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { parseRateToMicros } from "@/lib/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type RateRow = typeof exchangeRates.$inferSelect;

/** Registra una tasa (append-only: nunca se edita una tasa pasada). */
export async function addRate(
  db: Db,
  orgId: string,
  userId: UserId,
  input: { currency: string; rateToBase: string },
): Promise<RateRow> {
  parseRateToMicros(input.rateToBase); // valida > 0, ≤6 decimales
  const [row] = await db
    .insert(exchangeRates)
    .values({
      orgId,
      currency: input.currency,
      rateToBase: input.rateToBase.replace(",", "."),
    })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "exchange_rate",
    entityId: row.id,
    action: "create",
    after: input,
  });
  return row;
}

/** Tasa vigente (la más reciente) para una moneda. */
export async function getCurrentRate(
  db: Db,
  orgId: string,
  currency: string,
): Promise<RateRow | undefined> {
  const [row] = await db
    .select()
    .from(exchangeRates)
    .where(
      and(eq(exchangeRates.orgId, orgId), eq(exchangeRates.currency, currency)),
    )
    .orderBy(desc(exchangeRates.effectiveAt), desc(exchangeRates.createdAt))
    .limit(1);
  return row;
}

export async function listRates(db: Db, orgId: string): Promise<RateRow[]> {
  return db
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.orgId, orgId))
    .orderBy(desc(exchangeRates.effectiveAt))
    .limit(50);
}
