import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { sales, purchases } from "@/db/schema";
import { getSubscription } from "./queries";
import { subscriptionGate } from "./gate";

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Tope del modo gratuito (trial vencido sin activar): docs confirmados/mes. */
export const FREE_MONTHLY_DOCS = 20;

export type Allowance =
  | { limited: false }
  | { limited: true; used: number; max: number; allowed: boolean };

/**
 * ¿Puede la org confirmar otro documento (venta o compra)?
 * Ilimitado con plan activo o trial vigente; el trial vencido cae a modo
 * gratuito con tope mensual. Se cuenta por soldAt/receivedAt (se fijan al
 * confirmar; la cancelación no los borra — cancelar no libera cupo).
 */
export async function documentAllowance(
  db: Db,
  orgId: string,
  now: Date = new Date(),
  max: number = FREE_MONTHLY_DOCS,
): Promise<Allowance> {
  const gate = subscriptionGate(await getSubscription(db, orgId), now);
  if (gate.kind !== "trial-expired") return { limited: false };

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [s] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(sales)
    .where(
      and(
        eq(sales.orgId, orgId),
        isNotNull(sales.soldAt),
        gte(sales.soldAt, monthStart),
      ),
    );
  const [p] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(purchases)
    .where(
      and(
        eq(purchases.orgId, orgId),
        isNotNull(purchases.receivedAt),
        gte(purchases.receivedAt, monthStart),
      ),
    );
  const used = (s?.n ?? 0) + (p?.n ?? 0);
  return { limited: true, used, max, allowed: used < max };
}

/** Mensaje de error para las actions cuando el cupo se agota. */
export const FREE_LIMIT_ERROR = `Límite del plan gratuito alcanzado (${FREE_MONTHLY_DOCS} documentos este mes). Activa tu plan para seguir confirmando.`;
