import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import { getDashboard } from "@/features/dashboard/queries";
import { accountsReceivable } from "@/features/sales/queries";
import { listCommitmentsWithStatus } from "@/features/people/queries";
import { convertToBase, parseDecimalToCents } from "@/lib/money";

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Umbrales del asistente directivo, guardados en notify_settings (jsonb). */
export type AssistantThresholds = {
  salesGoalBase?: string; // meta de ventas del mes (decimal en moneda base)
  overdueLimitBase?: string; // tope tolerado de CxC vencida (decimal base)
};

export type AssistantAlert =
  | { kind: "sales-below-goal"; actualBaseCents: bigint; goalBaseCents: bigint }
  | { kind: "overdue-limit"; overdueBaseCents: bigint; limitBaseCents: bigint }
  | { kind: "low-stock"; count: number }
  | { kind: "commitments"; count: number };

/**
 * Asistente directivo (F5): compara los KPIs reales con los umbrales de la
 * org y devuelve solo lo que exige atención. Sin umbral configurado, ese
 * KPI no alerta (salvo stock bajo y compromisos, que siempre avisan).
 */
export async function assistantAlerts(
  db: Db,
  orgId: string,
): Promise<AssistantAlert[]> {
  const [row] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId));
  const notify = (row?.notifySettings ?? {}) as AssistantThresholds;
  const goal = notify.salesGoalBase
    ? parseDecimalToCents(notify.salesGoalBase)
    : null;
  const limit =
    notify.overdueLimitBase !== undefined && notify.overdueLimitBase !== ""
      ? parseDecimalToCents(notify.overdueLimitBase)
      : null;

  const [dash, ar, commitments] = await Promise.all([
    getDashboard(db, orgId),
    accountsReceivable(db, orgId),
    listCommitmentsWithStatus(db, orgId),
  ]);

  const alerts: AssistantAlert[] = [];

  if (goal !== null && dash.monthTotalBaseCents < goal) {
    alerts.push({
      kind: "sales-below-goal",
      actualBaseCents: dash.monthTotalBaseCents,
      goalBaseCents: goal,
    });
  }

  if (limit !== null) {
    const now = new Date();
    const overdueBaseCents = ar
      .filter((r) => r.dueDate && r.dueDate < now)
      .reduce(
        (acc, r) => acc + convertToBase(r.balanceCents, r.rateToBaseFixed),
        0n,
      );
    if (overdueBaseCents > limit) {
      alerts.push({
        kind: "overdue-limit",
        overdueBaseCents,
        limitBaseCents: limit,
      });
    }
  }

  if (dash.lowStockCount > 0) {
    alerts.push({ kind: "low-stock", count: dash.lowStockCount });
  }

  const unfulfilled = commitments.filter((c) => !c.fulfilled).length;
  if (unfulfilled > 0) {
    alerts.push({ kind: "commitments", count: unfulfilled });
  }

  return alerts;
}
