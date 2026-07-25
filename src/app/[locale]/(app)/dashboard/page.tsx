import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { eq } from "drizzle-orm";
import { TriangleAlert } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { organizations, orgSettings } from "@/db/schema";
import { getDashboard } from "@/features/dashboard/queries";
import {
  topCustomers,
  listCommitmentsWithStatus,
} from "@/features/people/queries";
import { centsToDecimalString, parseDecimalToCents } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/*
 * PARIDAD VISUAL — lote 3.
 *
 * El Panel de Control del ERP lleva sparklines y un gráfico de "Ventas
 * facturadas vs Cobros registrados" en ECharts. NO se portan: son series
 * temporales y los datos de este dashboard son totales del mes, embudo y CxC
 * — no hay serie que dibujar. Traerla exige una query nueva y este trabajo no
 * toca queries. Instalar ECharts (~300 KB) sin datos que representar seria
 * peso muerto. Diferido como trabajo propio.
 */
export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.dashboard");
  const db = getDb();
  const [[org], [settings], data, top, commitments] = await Promise.all([
    db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId)),
    db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)),
    getDashboard(db, orgId),
    topCustomers(db, orgId, 5),
    listCommitmentsWithStatus(db, orgId),
  ]);
  const unfulfilled = commitments.filter((c) => !c.fulfilled);
  const base = settings?.baseCurrency ?? "CUP";
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.count));

  // Asistente directivo (F5): umbrales de notify_settings contra los KPIs.
  const ta = await getTranslations("app.assistant");
  const notify = (settings?.notifySettings ?? {}) as {
    salesGoalBase?: string;
    overdueLimitBase?: string;
  };
  const assistant: string[] = [];
  if (notify.salesGoalBase) {
    const goal = parseDecimalToCents(notify.salesGoalBase);
    if (data.monthTotalBaseCents < goal) {
      assistant.push(
        ta("belowGoal", {
          actual: centsToDecimalString(data.monthTotalBaseCents),
          goal: centsToDecimalString(goal),
          base,
        }),
      );
    }
  }
  if (notify.overdueLimitBase) {
    const limit = parseDecimalToCents(notify.overdueLimitBase);
    if (data.overdueBaseCents > limit) {
      assistant.push(
        ta("overLimit", {
          actual: centsToDecimalString(data.overdueBaseCents),
          limit: centsToDecimalString(limit),
          base,
        }),
      );
    }
  }

  const now = new Date();
  const eyebrow = `№ ${String(now.getMonth() + 1).padStart(2, "0")} · ${now.getFullYear()}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        large
        eyebrow={eyebrow}
        title={t("title")}
        subtitle={org?.name ?? undefined}
      />

      {assistant.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <p className="font-medium">{ta("title")}</p>
          <ul className="mt-1 list-disc pl-5">
            {assistant.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {unfulfilled.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <p className="font-medium">
            {t("commitmentsDue", { count: unfulfilled.length })}
          </p>
          <ul className="mt-1 text-xs text-muted-foreground">
            {unfulfilled.slice(0, 3).map((c) => (
              <li key={c.id}>
                {c.customerName}: {c.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.lowStockCount > 0 && (
        <Link
          href="/products"
          className="flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm hover:bg-warning/20"
        >
          <TriangleAlert className="size-4 text-warning" aria-hidden />
          {t("lowStock", { count: data.lowStockCount })}
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="t-eyebrow">{t("monthSales", { base })}</p>
            <p className="t-num-display mt-1 text-2xl" data-numeric="">
              {centsToDecimalString(data.monthTotalBaseCents)}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">{t("fixedRates")}</p>
          </CardContent>
        </Card>
        {data.salesByCurrency.map((s) => (
          <Card key={s.currency}>
            <CardContent className="p-4">
              <p className="t-eyebrow">
                {t("inCurrency", { currency: s.currency, count: s.count })}
              </p>
              <p className="t-num-display mt-1 text-2xl" data-numeric="">
                {centsToDecimalString(s.totalCents)}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="t-eyebrow">{t("productionMonth")}</p>
            <p className="t-num-display mt-1 text-2xl" data-numeric="">
              {data.productionMonth.orders}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("funnel")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.funnel.map((f) => (
              <div
                key={f.stageName}
                className="flex items-center gap-2 text-sm"
              >
                <span className="w-28 shrink-0">{f.stageName}</span>
                <div className="h-5 flex-1 rounded bg-muted">
                  <div
                    className="h-5 rounded bg-primary/70"
                    style={{ width: `${(f.count / maxFunnel) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right" data-numeric="">
                  {f.count}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("topCustomers")}</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noSales")}</p>
            ) : (
              <ol className="divide-y text-sm">
                {top.map((c, i) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span>
                      <span className="mr-2 text-xs text-muted-foreground">
                        {i + 1}.
                      </span>
                      {c.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({c.count})
                      </span>
                    </span>
                    <span className="font-medium" data-numeric="">
                      {centsToDecimalString(c.totalBaseCents)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("receivables")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.receivables.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDebt")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.receivables.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex justify-between py-2">
                    <Link
                      href={`/sales/${r.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {r.label} · {r.customerName}
                      {r.overdue && (
                        <span className="ml-2 rounded-full bg-destructive/10 px-2 text-xs text-destructive">
                          {t("overdue")}
                        </span>
                      )}
                    </Link>
                    <span className="font-medium" data-numeric="">
                      {centsToDecimalString(r.balanceCents)} {r.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
