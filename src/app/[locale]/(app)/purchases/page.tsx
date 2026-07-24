import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listPurchases } from "@/features/purchases/queries";
import { convertToBase, centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PurchasesFilters } from "@/features/purchases/purchases-filters";

// Port fiel de "Gestión de Compras" del ERP: filtros (búsqueda, estado, rango
// default mes actual) + columnas Tipo (Contado/Crédito) y Saldo + panel
// lateral (Total comprado, Top proveedores, Por estado, Métricas).

const pad = (n: number) => String(n).padStart(2, "0");
const dstr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default async function PurchasesPage({
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
  const t = await getTranslations("app.purchases");
  const sp = await searchParams;
  const all = await listPurchases(getDb(), orgId);

  const ahora = new Date();
  const desde =
    sp.desde ?? dstr(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
  const hasta = sp.hasta ?? dstr(ahora);
  const q = (sp.q ?? "").toLowerCase();
  const estadoFiltro = sp.estado ?? "";

  const conFecha = all.map((p) => ({
    ...p,
    fecha: p.receivedAt ?? p.createdAt,
  }));
  const rows = conFecha.filter((p) => {
    const f = dstr(p.fecha);
    if (f < desde || f > hasta) return false;
    if (estadoFiltro && p.status !== estadoFiltro) return false;
    if (q) {
      const num = p.number ? `${p.series}-${p.number}` : "";
      if (
        !p.supplierName.toLowerCase().includes(q) &&
        !num.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const activas = rows.filter((p) => p.status !== "cancelled");
  const compradoBase = activas.reduce(
    (s, p) => s + convertToBase(p.totalCents, p.rateToBaseFixed),
    0n,
  );
  const porProveedor = new Map<string, bigint>();
  for (const p of activas) {
    porProveedor.set(
      p.supplierName,
      (porProveedor.get(p.supplierName) ?? 0n) +
        convertToBase(p.totalCents, p.rateToBaseFixed),
    );
  }
  const topProveedores = [...porProveedor.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 3);
  const porEstado = (["confirmed", "draft", "cancelled"] as const).map(
    (e) => [e, rows.filter((p) => p.status === e).length] as const,
  );
  const maxEstado = Math.max(1, ...porEstado.map(([, n]) => n));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/purchases/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>

      <PurchasesFilters
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
                    <th className="px-4 py-2 font-medium">Nº</th>
                    <th className="px-4 py-2 font-medium">{t("date")}</th>
                    <th className="px-4 py-2 font-medium">{t("supplier")}</th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("total")}
                    </th>
                    <th className="px-4 py-2 font-medium">{t("type")}</th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("balance")}
                    </th>
                    <th className="px-4 py-2 font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((p) => {
                    const balance = p.totalCents - p.paidCents;
                    const contado = p.paymentTerms === "Contado";
                    return (
                      <tr key={p.id} className="hover:bg-accent">
                        <td className="px-4 py-2" data-numeric="">
                          <Link
                            href={`/purchases/${p.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {p.number ? `${p.series}-${p.number}` : t("draft")}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {p.fecha.toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">{p.supplierName}</td>
                        <td className="px-4 py-2 text-right" data-numeric="">
                          {centsToDecimalString(p.totalCents)} {p.currency}
                        </td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                            {contado
                              ? `💵 ${t("cashType")}`
                              : `📋 ${t("creditType")}`}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right" data-numeric="">
                          {p.status !== "confirmed" || contado
                            ? "—"
                            : balance > 0n
                              ? `${centsToDecimalString(balance)} ${p.currency}`
                              : `✓ ${t("settled")}`}
                        </td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                            {t(`statuses.${p.status}`)}
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

        {/* Panel lateral (ComprasSummaryPanel del ERP) */}
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("panel.totalPurchased")}
            </p>
            <p className="text-xl font-bold" data-numeric="">
              {centsToDecimalString(compradoBase)}
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
              {t("panel.topSuppliers")}
            </p>
            {topProveedores.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("panel.topEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {topProveedores.map(([name, total]) => (
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
                    <span>{t(`statuses.${e}`)}</span>
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
        </aside>
      </div>
    </div>
  );
}
