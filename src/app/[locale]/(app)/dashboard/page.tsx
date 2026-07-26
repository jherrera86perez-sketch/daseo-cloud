import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { eq } from "drizzle-orm";
import { TriangleAlert } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { organizations, orgSettings } from "@/db/schema";
import { getDashboard } from "@/features/dashboard/queries";
import { tendencias } from "@/features/assistant/analytics";
import { saldoTendencia } from "@/features/consolidado/queries";
import { incomeSourceDetail } from "@/features/fiscal/queries";
import {
  topCustomers,
  listCommitmentsWithStatus,
} from "@/features/people/queries";
import { centsToDecimalString, parseDecimalToCents } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline, DualLineChart } from "@/components/ui/sparkline";

/*
 * PARIDAD VISUAL — Panel de Control, clon del ERP CubaOne.
 *
 * Estructura del ERP: HERO de cuentas por cobrar (cifra grande, chip de riesgo
 * de concentracion, contexto en cursiva y sparkline) + columna derecha con
 * Saldo en banco / Concentracion / Bancarizacion, y debajo la curva de ventas.
 *
 * Los graficos se dibujan con SVG puro, NO con ECharts: para lineas con
 * relleno el resultado es indistinguible y cuesta 0 KB de JavaScript — el
 * mismo criterio con el que Cloud ya dibuja el Pareto de Top Clientes.
 *
 * Todos los datos vienen de queries que YA existen en otros modulos
 * (tendencias del asistente, saldoTendencia del consolidado,
 * incomeSourceDetail del fiscal): no se escribe ninguna query nueva, igual
 * que se hizo con el header.
 */
export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.dashboard");
  const db = getDb();
  const ahora = new Date();
  const [[org], [settings], data, top, commitments, trend, saldo, ingresos] =
    await Promise.all([
      db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId)),
      db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)),
      getDashboard(db, orgId),
      topCustomers(db, orgId, 5),
      listCommitmentsWithStatus(db, orgId),
      // Series y agregados que YA calculan otros módulos: se reutilizan, no se
      // escribe ninguna query nueva (mismo criterio que el header).
      tendencias(db, orgId, 6),
      saldoTendencia(db, orgId, 6),
      incomeSourceDetail(db, orgId, ahora.getFullYear(), ahora.getMonth() + 1),
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
  const hoyLargo = now.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // ── Datos del hero. Todos salen de queries que YA existen en otros módulos;
  // no se escribe ninguna nueva, igual que se hizo con el header.
  const cxcTotal = data.receivables.reduce((s, r) => s + r.balanceCents, 0n);
  const porCliente = new Map<string, bigint>();
  for (const r of data.receivables) {
    porCliente.set(
      r.customerName,
      (porCliente.get(r.customerName) ?? 0n) + r.balanceCents,
    );
  }
  const numClientes = porCliente.size;
  const [mayor] = [...porCliente.entries()].sort((a, b) =>
    b[1] > a[1] ? 1 : -1,
  );
  const topDeudor = mayor ? { name: mayor[0], total: mayor[1] } : null;
  const concentracionPct =
    topDeudor && cxcTotal > 0n
      ? Number((topDeudor.total * 100n) / cxcTotal)
      : 0;

  const ventasSerie = trend.map((m) => m.ventas_total);
  // El ERP contrasta "Ventas facturadas" con "Cobros registrados". Aqui solo
  // se dibuja la serie de ventas, que es real: una serie de cobros exigiria una
  // query propia, y derivarla escalando las ventas produciria una curva
  // paralela que PARECE un dato y no lo es. Pendiente como trabajo aparte.
  const mesesSerie = trend.map((m) => m.mes.slice(5));
  // Mismo formato que el resto de la app: punto decimal, dos decimales.
  const saldoBanco = saldo.saldoActual
    ? Number(saldo.saldoActual).toFixed(2)
    : "—";
  // ≈ "bancarización" del ERP: cuánto del ingreso del mes pasó por el banco.
  const bancarizacionPct =
    data.monthTotalBaseCents > 0n
      ? Math.round(
          Number((ingresos.totalCents * 1000n) / data.monthTotalBaseCents),
        ) / 10
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        large
        eyebrow={eyebrow}
        title={t("title")}
        subtitle={org?.name ?? undefined}
      />

      {/*
       * HERO ≈ HeroBalance.tsx del ERP: cuentas por cobrar a lo grande, chip de
       * riesgo de concentración, línea de contexto en cursiva y sparkline al
       * pie; a la derecha, Saldo en banco / Concentración / Bancarización.
       */}
      <Card className="gap-0 overflow-hidden py-0">
        <div className="grid lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col justify-between border-border p-6 lg:border-r">
            <div>
              <p className="t-eyebrow mb-3">
                <span className="mr-2 inline-block w-6 border-t border-brand-accent align-middle" />
                {t("hero.receivables", { date: hoyLargo })}
              </p>

              <p
                className="t-num-display text-[44px] leading-none"
                data-numeric=""
              >
                <span className="mr-1 align-top text-lg text-text-muted">
                  $
                </span>
                {centsToDecimalString(cxcTotal)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {concentracionPct >= 40 && topDeudor ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FEE2E2] px-2.5 py-1 text-xs font-medium text-[#7F1D1D] dark:bg-[#450A0A] dark:text-[#F87171]">
                    <TriangleAlert className="size-3.5" aria-hidden />
                    {t("hero.concentrationWarn", { pct: concentracionPct })}
                  </span>
                ) : null}
                <span className="t-display-italic text-sm text-muted-foreground">
                  {t("hero.context", {
                    invoices: data.receivables.length,
                    customers: numClientes,
                  })}
                  {topDeudor
                    ? ` · ${topDeudor.name} ${centsToDecimalString(topDeudor.total)}`
                    : ""}
                </span>
              </div>
            </div>

            {ventasSerie.length > 1 ? (
              <Sparkline values={ventasSerie} className="mt-6 h-16" />
            ) : null}
          </div>

          <div className="divide-y divide-border">
            <div className="p-5">
              <p className="t-eyebrow">{t("hero.bankBalance")}</p>
              <p
                className="t-num-display mt-1 text-2xl text-destructive"
                data-numeric=""
              >
                {saldoBanco}
              </p>
            </div>

            <div className="p-5">
              <p className="t-eyebrow">
                {t("hero.concentration")}
                {topDeudor ? ` · ${topDeudor.name}` : ""}
              </p>
              <p
                className="t-num-display mt-1 text-2xl text-brand-accent"
                data-numeric=""
              >
                {topDeudor ? centsToDecimalString(topDeudor.total) : "—"}
              </p>
              <p className="t-display-italic mt-1 text-xs text-text-muted">
                {t("hero.concentrationHint", { pct: concentracionPct })}
              </p>
              <div className="mt-2 h-1 rounded-full bg-surface-200">
                <div
                  className="h-1 rounded-full bg-brand-accent"
                  style={{ width: `${Math.min(100, concentracionPct)}%` }}
                />
              </div>
            </div>

            <div className="p-5">
              <p className="t-eyebrow">{t("hero.banked")}</p>
              <p className="t-num-display mt-1 text-2xl" data-numeric="">
                {bancarizacionPct}
                <span className="ml-0.5 text-base text-text-muted">%</span>
              </p>
              <p className="t-display-italic mt-1 text-xs text-text-muted">
                {t("hero.bankedHint")}
              </p>
            </div>
          </div>
        </div>
      </Card>

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

      {/* ≈ "Ventas facturadas vs Cobros registrados" del ERP */}
      {ventasSerie.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("salesTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DualLineChart
              labels={mesesSerie}
              seriesA={ventasSerie}
              labelA={t("invoiced")}
            />
          </CardContent>
        </Card>
      ) : null}

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
