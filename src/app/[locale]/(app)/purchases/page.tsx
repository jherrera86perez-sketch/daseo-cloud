import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listPurchases } from "@/features/purchases/queries";
import { convertToBase, centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DensityToggle } from "@/components/ui/atoms/density-toggle";
import { EmptyState } from "@/components/ui/feedback/empty-state";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { TH } from "@/components/ui/data-table";
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
    <PageLayout
      header={
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            <Button asChild size="sm">
              <Link href="/purchases/new">
                <Plus className="size-4" aria-hidden /> {t("new")}
              </Link>
            </Button>
          }
        />
      }
      filters={
        <>
          <PurchasesFilters
            q={sp.q ?? ""}
            estado={estadoFiltro}
            desde={desde}
            hasta={hasta}
          />
          <DensityToggle className="ml-auto" />
        </>
      }
      aside={
        /* Panel lateral (ComprasSummaryPanel del ERP) */
        <>
          <Card className="gap-1 py-4">
            <div className="px-4">
              <p className="t-eyebrow">{t("panel.totalPurchased")}</p>
              <p className="t-num-display mt-1 text-[22px]" data-numeric="">
                {centsToDecimalString(compradoBase)}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {t("panel.activeCount", {
                  active: activas.length,
                  total: rows.length,
                })}
              </p>
            </div>
          </Card>

          <Card className="gap-2 py-4">
            <div className="px-4">
              <p className="t-eyebrow mb-2">{t("panel.topSuppliers")}</p>
              {topProveedores.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("panel.topEmpty")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {topProveedores.map(([name, total]) => (
                    <li key={name} className="flex justify-between gap-2">
                      <span className="truncate">{name}</span>
                      <span className="t-num shrink-0" data-numeric="">
                        {centsToDecimalString(total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="gap-2 py-4">
            <div className="px-4">
              <p className="t-eyebrow mb-2">{t("panel.byStatus")}</p>
              <ul className="flex flex-col gap-2">
                {porEstado.map(([e, n]) => (
                  <li key={e} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span>{t(`statuses.${e}`)}</span>
                      <span className="t-num" data-numeric="">
                        {n}
                      </span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-surface-200">
                      <div
                        className="h-1 rounded-full bg-primary"
                        style={{ width: `${(n / maxEstado) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <Card>
              <EmptyState
                title={all.length === 0 ? t("empty") : t("emptyFiltered")}
              />
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-surface-100 text-left">
                  <tr>
                    <TH>Nº</TH>
                    <TH>{t("date")}</TH>
                    <TH>{t("supplier")}</TH>
                    <TH numeric>{t("total")}</TH>
                    <TH>{t("type")}</TH>
                    <TH numeric>{t("balance")}</TH>
                    <TH>{t("status")}</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {rows.map((p) => {
                    const balance = p.totalCents - p.paidCents;
                    const contado = p.paymentTerms === "Contado";
                    return (
                      <tr
                        key={p.id}
                        className="transition-colors hover:bg-surface-hover"
                      >
                        <td data-numeric="">
                          <Link
                            href={`/purchases/${p.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {p.number ? `${p.series}-${p.number}` : t("draft")}
                          </Link>
                        </td>
                        <td className="text-muted-foreground">
                          {p.fecha.toLocaleDateString()}
                        </td>
                        <td>{p.supplierName}</td>
                        <td className="text-right" data-numeric="">
                          {centsToDecimalString(p.totalCents)} {p.currency}
                        </td>
                        <td>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                            {contado
                              ? `💵 ${t("cashType")}`
                              : `📋 ${t("creditType")}`}
                          </span>
                        </td>
                        <td className="text-right" data-numeric="">
                          {p.status !== "confirmed" || contado
                            ? "—"
                            : balance > 0n
                              ? `${centsToDecimalString(balance)} ${p.currency}`
                              : `✓ ${t("settled")}`}
                        </td>
                        <td>
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
      </div>
    </PageLayout>
  );
}
