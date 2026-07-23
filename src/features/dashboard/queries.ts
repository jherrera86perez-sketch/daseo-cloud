import { listSales, accountsReceivable } from "@/features/sales/queries";
import { listStagesWithDeals } from "@/features/pipeline/queries";
import { lowStockProducts } from "@/features/inventory/queries";
import { listOrders } from "@/features/production/queries";
import { convertToBase } from "@/lib/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Dashboard = {
  salesByCurrency: Array<{
    currency: string;
    totalCents: bigint;
    count: number;
  }>;
  monthTotalBaseCents: bigint;
  receivables: Array<{
    id: string;
    customerName: string;
    currency: string;
    balanceCents: bigint;
    dueDate: Date | null;
    overdue: boolean;
    label: string;
  }>;
  funnel: Array<{ stageName: string; count: number; amountBase: bigint }>;
  lowStockCount: number;
  productionMonth: { orders: number };
  /** CxC vencida consolidada a base (tasas fijadas) — para el asistente. */
  overdueBaseCents: bigint;
};

/** Consolidación SIEMPRE a las tasas fijadas de cada documento (regla del plan). */
export async function getDashboard(db: Db, orgId: string): Promise<Dashboard> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sales, ar, board, low, orders] = await Promise.all([
    listSales(db, orgId),
    accountsReceivable(db, orgId),
    listStagesWithDeals(db, orgId),
    lowStockProducts(db, orgId),
    listOrders(db, orgId),
  ]);

  const monthSales = sales.filter(
    (s) => s.status === "confirmed" && s.soldAt && s.soldAt >= monthStart,
  );
  const byCurrency = new Map<string, { totalCents: bigint; count: number }>();
  let monthTotalBaseCents = 0n;
  for (const s of monthSales) {
    const cur = byCurrency.get(s.currency) ?? { totalCents: 0n, count: 0 };
    cur.totalCents += s.totalCents;
    cur.count += 1;
    byCurrency.set(s.currency, cur);
    monthTotalBaseCents += s.totalBaseCents;
  }

  return {
    salesByCurrency: [...byCurrency.entries()].map(([currency, v]) => ({
      currency,
      ...v,
    })),
    monthTotalBaseCents,
    receivables: ar.map((r) => ({
      id: r.id,
      customerName: r.customerName,
      currency: r.currency,
      balanceCents: r.balanceCents,
      dueDate: r.dueDate,
      overdue: Boolean(r.dueDate && r.dueDate < now),
      label: r.number ? `${r.series}-${r.number}` : "",
    })),
    funnel: board.map((b) => ({
      stageName: b.stage.name,
      count: b.deals.length,
      amountBase: b.deals.reduce((acc, d) => acc + d.amountCents, 0n),
    })),
    overdueBaseCents: ar
      .filter((r) => r.dueDate && r.dueDate < now)
      .reduce(
        (acc, r) => acc + convertToBase(r.balanceCents, r.rateToBaseFixed),
        0n,
      ),
    lowStockCount: low.length,
    productionMonth: {
      orders: orders.filter(
        (o) => o.status === "confirmed" && o.updatedAt >= monthStart,
      ).length,
    },
  };
}
