import { getTranslations } from "next-intl/server";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  listProductsWithStock,
  lowStockAlerts,
} from "@/features/inventory/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Port fiel de "Inventario Global" del ERP: Estado por umbrales (Crítico≤5 /
// Bajo≤stock_min||10 / OK) + panel lateral (Valor inventariado, Top 3, Por
// estado, Costo promedio) + alertas con urgencia y cascada a productos finales.

function estadoStock(
  stock: number,
  stockMin: number,
): "critico" | "bajo" | "ok" {
  if (stock <= 5) return "critico";
  if (stock <= (stockMin || 10)) return "bajo";
  return "ok";
}

const ESTADO_CLS: Record<string, string> = {
  critico: "bg-destructive/10 text-destructive",
  bajo: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const URGENCIA_CLS: Record<string, string> = {
  CRITICA: "bg-destructive/10 text-destructive",
  ALTA: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  MEDIA: "bg-secondary text-muted-foreground",
};

export default async function ProductsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const { orgId } = await requireOrg();
  const { q } = await searchParams;
  const t = await getTranslations("app.products");
  const db = getDb();
  const [rows, alerts] = await Promise.all([
    listProductsWithStock(db, orgId, { search: q }),
    lowStockAlerts(db, orgId),
  ]);

  const activos = rows.filter((p) => !p.deletedAt);
  const valorInventariado = activos.reduce(
    (s, p) => s + Number(p.balance) * (Number(p.avg_cost_cents) / 100),
    0,
  );
  const topPorValor = [...activos]
    .map((p) => ({
      ...p,
      valor: Number(p.balance) * (Number(p.avg_cost_cents) / 100),
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 3);
  const distribucion = { sinStock: 0, critico: 0, bajo: 0, ok: 0 };
  for (const p of activos) {
    const stock = Number(p.balance);
    if (stock === 0) distribucion.sinStock++;
    else {
      const e = estadoStock(stock, Number(p.stockMin));
      if (e === "critico") distribucion.critico++;
      else if (e === "bajo") distribucion.bajo++;
      else distribucion.ok++;
    }
  }
  const costoPromedio =
    activos.length > 0
      ? activos.reduce((s, p) => s + Number(p.avg_cost_cents) / 100, 0) /
        activos.length
      : 0;
  const vendibles = activos.filter((p) => p.isSellable).length;
  const maxDist = Math.max(1, ...Object.values(distribucion));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>

      {alerts.total > 0 && (
        <details className="rounded-md border border-warning/50 bg-warning/10">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
            <TriangleAlert className="size-4 text-warning" aria-hidden />
            {t("lowStockAlert", { count: alerts.total })}
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {alerts.alerts.map((a) => (
              <div
                key={a.productId}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-sm"
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${URGENCIA_CLS[a.urgencia]}`}
                >
                  {t(`urgency.${a.urgencia}`)}
                </span>
                <span className="font-medium">{a.nombre}</span>
                <span className="text-muted-foreground" data-numeric="">
                  {a.stockActual} / {a.stockMinimo}
                </span>
                {a.productosAfectados.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t("cascadeNote", {
                      products: a.productosAfectados
                        .map(
                          (x) =>
                            `${x.finalProductName} (${x.batchesProducibles})`,
                        )
                        .join(", "),
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <form method="get" className="relative max-w-sm">
        <Search
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="pl-8"
        />
      </form>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t("form.name")}</th>
                    <th className="px-4 py-2 font-medium">{t("form.sku")}</th>
                    <th className="px-4 py-2 font-medium">
                      {t("form.category")}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("stock")}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("avgCost")}
                    </th>
                    <th className="px-4 py-2 font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((p) => {
                    const stock = Number(p.balance);
                    const estado = estadoStock(stock, Number(p.stockMin));
                    return (
                      <tr key={p.id} className="hover:bg-accent">
                        <td className="px-4 py-2">
                          <Link
                            href={`/products/${p.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {p.sku ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {p.category
                            ? t(`form.categories.${p.category}`)
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right" data-numeric="">
                          {p.balance} {t(`form.units.${p.unit}`)}
                        </td>
                        <td className="px-4 py-2 text-right" data-numeric="">
                          {centsToDecimalString(BigInt(p.avg_cost_cents))}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[estado]}`}
                          >
                            {t(`stockStatus.${estado}`)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel lateral (InventarioSummaryPanel del ERP) */}
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.inventoryValue")}
            </p>
            <p className="text-xl font-bold" data-numeric="">
              {valorInventariado.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("panel.skuCount", { count: activos.length })}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.topByValue")}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {topPorValor.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span data-numeric="">{p.valor.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.byStatus")}
            </p>
            <ul className="flex flex-col gap-1">
              {(
                [
                  ["ok", distribucion.ok],
                  ["bajo", distribucion.bajo],
                  ["critico", distribucion.critico],
                  ["sinStock", distribucion.sinStock],
                ] as const
              ).map(([k, n]) => (
                <li key={k} className="text-xs">
                  <div className="flex justify-between">
                    <span>{t(`panel.dist.${k}`)}</span>
                    <span data-numeric="">{n}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded bg-muted">
                    <div
                      className="h-1.5 rounded bg-primary"
                      style={{ width: `${(n / maxDist) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.metrics")}
            </p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("panel.avgCost")}
              </span>
              <span data-numeric="">{costoPromedio.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("panel.sellable")}
              </span>
              <span data-numeric="">{vendibles}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
