import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  listSales,
  paymentStatus,
  type EstadoCobro,
} from "@/features/sales/queries";
import { convertToBase, centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SalesFilters } from "@/features/sales/sales-filters";

// Port fiel de "Ventas y Facturación" del ERP: filtros (búsqueda, estado de
// cobro, rango de fechas default mes actual) + panel lateral con Total
// facturado (excluye canceladas), Top 3 clientes, Por estado y Métricas.

const ESTADO_CLS: Record<EstadoCobro, string> = {
  PAGADA: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PARCIAL: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PENDIENTE: "bg-secondary text-muted-foreground",
  CANCELADA: "bg-destructive/10 text-destructive",
  BORRADOR: "border text-muted-foreground",
};

const pad = (n: number) => String(n).padStart(2, "0");
const dstr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default async function SalesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    q?: string;
    estado?: string;
    desde?: string;
    hasta?: string;
  }>;
}>) {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.sales");
  const sp = await searchParams;
  const all = await listSales(getDb(), orgId);

  // ERP: rango por defecto = mes actual (getThisMonthRange)
  const ahora = new Date();
  const desde =
    sp.desde ?? dstr(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
  const hasta = sp.hasta ?? dstr(ahora);
  const q = (sp.q ?? "").toLowerCase();
  const estadoFiltro = sp.estado ?? "";

  const conEstado = all.map((s) => ({
    ...s,
    estadoCobro: paymentStatus(s, s.paidCents),
    fecha: s.soldAt ?? s.createdAt,
  }));

  const rows = conEstado.filter((s) => {
    const f = dstr(s.fecha);
    if (f < desde || f > hasta) return false;
    if (estadoFiltro && s.estadoCobro !== estadoFiltro) return false;
    if (q) {
      const num = s.number ? `${s.series}-${s.number}` : "";
      if (
        !s.customerName.toLowerCase().includes(q) &&
        !num.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // Panel lateral del ERP (sobre el filtro actual)
  const activas = rows.filter((s) => s.estadoCobro !== "CANCELADA");
  const facturadoBase = activas.reduce(
    (s, v) => s + convertToBase(v.totalCents, v.rateToBaseFixed),
    0n,
  );
  const porCliente = new Map<string, bigint>();
  for (const v of activas) {
    porCliente.set(
      v.customerName,
      (porCliente.get(v.customerName) ?? 0n) +
        convertToBase(v.totalCents, v.rateToBaseFixed),
    );
  }
  const topClientes = [...porCliente.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 3);
  const porEstado = (
    ["PAGADA", "PARCIAL", "PENDIENTE", "CANCELADA"] as const
  ).map((e) => [e, rows.filter((s) => s.estadoCobro === e).length] as const);
  const maxEstado = Math.max(1, ...porEstado.map(([, n]) => n));
  const promedio =
    activas.length > 0 ? facturadoBase / BigInt(activas.length) : 0n;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/sales/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>

      <SalesFilters
        q={sp.q ?? ""}
        estado={estadoFiltro}
        desde={desde}
        hasta={hasta}
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {all.length === 0 ? t("empty") : t("emptyFiltered")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t("invoice")}</th>
                    <th className="px-4 py-2 font-medium">{t("date")}</th>
                    <th className="px-4 py-2 font-medium">{t("customer")}</th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("total")}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("balance")}
                    </th>
                    <th className="px-4 py-2 font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((s) => {
                    const balance = s.totalCents - s.paidCents;
                    return (
                      <tr key={s.id} className="hover:bg-accent">
                        <td className="px-4 py-2" data-numeric="">
                          <Link
                            href={`/sales/${s.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {s.number ? `${s.series}-${s.number}` : t("draft")}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {s.fecha.toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">{s.customerName}</td>
                        <td className="px-4 py-2 text-right" data-numeric="">
                          {centsToDecimalString(s.totalCents)} {s.currency}
                        </td>
                        <td className="px-4 py-2 text-right" data-numeric="">
                          {s.status === "confirmed" && balance > 0n
                            ? `${centsToDecimalString(balance)} ${s.currency}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[s.estadoCobro]}`}
                          >
                            {t(`payStatus.${s.estadoCobro}`)}
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

        {/* Panel lateral (VentasSummaryPanel del ERP) */}
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.totalInvoiced")}
            </p>
            <p className="text-xl font-bold" data-numeric="">
              {centsToDecimalString(facturadoBase)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("panel.activeCount", {
                active: activas.length,
                total: rows.length,
              })}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.topCustomers")}
            </p>
            {topClientes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("panel.topEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {topClientes.map(([name, total]) => (
                  <li key={name} className="flex justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <span data-numeric="">{centsToDecimalString(total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.byStatus")}
            </p>
            <ul className="flex flex-col gap-1">
              {porEstado.map(([e, n]) => (
                <li key={e} className="text-xs">
                  <div className="flex justify-between">
                    <span>{t(`payStatus.${e}`)}</span>
                    <span data-numeric="">{n}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded bg-muted">
                    <div
                      className="h-1.5 rounded bg-primary"
                      style={{ width: `${(n / maxEstado) * 100}%` }}
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
              <span className="text-muted-foreground">{t("panel.avg")}</span>
              <span data-numeric="">{centsToDecimalString(promedio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("payStatus.PAGADA")}
              </span>
              <span data-numeric="">
                {rows.filter((s) => s.estadoCobro === "PAGADA").length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("payStatus.CANCELADA")}
              </span>
              <span data-numeric="">
                {rows.filter((s) => s.estadoCobro === "CANCELADA").length}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
