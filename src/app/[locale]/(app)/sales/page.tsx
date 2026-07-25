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
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/atoms/status-dot";
import { DensityToggle } from "@/components/ui/atoms/density-toggle";
import { EmptyState } from "@/components/ui/feedback/empty-state";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import {
  DataTable,
  THead,
  TBody,
  TRow,
  TH,
  TD,
} from "@/components/ui/data-table";
import { SalesFilters } from "@/features/sales/sales-filters";

// Port fiel de "Ventas y Facturación" del ERP: filtros (búsqueda, estado de
// cobro, rango de fechas default mes actual) + panel lateral con Total
// facturado (excluye canceladas), Top 3 clientes, Por estado y Métricas.
//
// LOTE 1 de la paridad visual: la pantalla se recompone con las piezas de la
// fundación (PageLayout, PageHeader, DataTable, Card, Badge). Las queries, los
// filtros y los cálculos no se tocan — sólo cambia cómo se presenta.
//
// NO se porta la paginación del ERP ("Mostrando 1 - 15 de 18" + 1/2): exigiría
// paginar en servidor, y este trabajo tiene prohibido tocar queries.

const ESTADO_TONE: Record<EstadoCobro, BadgeTone> = {
  PAGADA: "success",
  PARCIAL: "warning",
  PENDIENTE: "neutral",
  CANCELADA: "danger",
  BORRADOR: "neutral",
};

const ESTADO_DOT: Record<
  EstadoCobro,
  "success" | "warning" | "neutral" | "danger"
> = {
  PAGADA: "success",
  PARCIAL: "warning",
  PENDIENTE: "neutral",
  CANCELADA: "danger",
  BORRADOR: "neutral",
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
    <PageLayout
      header={
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            <Button asChild size="sm">
              <Link href="/sales/new">
                <Plus className="size-4" aria-hidden /> {t("new")}
              </Link>
            </Button>
          }
        />
      }
      filters={
        <>
          <SalesFilters
            q={sp.q ?? ""}
            estado={estadoFiltro}
            desde={desde}
            hasta={hasta}
          />
          <DensityToggle className="ml-auto" />
        </>
      }
      aside={
        <>
          {/* Panel lateral (VentasSummaryPanel del ERP) */}
          <Card className="gap-1 py-4">
            <div className="px-4">
              <p className="t-eyebrow">{t("panel.totalInvoiced")}</p>
              <p className="t-num-display mt-1 text-[22px]" data-numeric="">
                {centsToDecimalString(facturadoBase)}
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
              <p className="t-eyebrow mb-2">{t("panel.topCustomers")}</p>
              {topClientes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("panel.topEmpty")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {topClientes.map(([name, total]) => (
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
                      <span className="flex items-center gap-1.5">
                        <StatusDot tone={ESTADO_DOT[e]} />
                        {t(`payStatus.${e}`)}
                      </span>
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

          <Card className="gap-2 py-4">
            <div className="px-4 text-sm">
              <p className="t-eyebrow mb-2">{t("panel.metrics")}</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("panel.avg")}</span>
                <span className="t-num" data-numeric="">
                  {centsToDecimalString(promedio)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("payStatus.PAGADA")}
                </span>
                <span className="t-num" data-numeric="">
                  {rows.filter((s) => s.estadoCobro === "PAGADA").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("payStatus.CANCELADA")}
                </span>
                <span className="t-num" data-numeric="">
                  {rows.filter((s) => s.estadoCobro === "CANCELADA").length}
                </span>
              </div>
            </div>
          </Card>
        </>
      }
    >
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={all.length === 0 ? t("empty") : t("emptyFiltered")}
          />
        </Card>
      ) : (
        <DataTable>
          <THead>
            <TRow className="hover:bg-transparent">
              <TH>{t("invoice")}</TH>
              <TH>{t("date")}</TH>
              <TH>{t("customer")}</TH>
              <TH numeric>{t("total")}</TH>
              <TH numeric>{t("balance")}</TH>
              <TH>{t("status")}</TH>
            </TRow>
          </THead>
          <TBody>
            {rows.map((s) => {
              const balance = s.totalCents - s.paidCents;
              return (
                <TRow key={s.id}>
                  <TD data-numeric="">
                    <Link
                      href={`/sales/${s.id}`}
                      className="t-num font-medium underline-offset-4 hover:underline"
                    >
                      {s.number ? `${s.series}-${s.number}` : t("draft")}
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">
                    {s.fecha.toLocaleDateString()}
                  </TD>
                  <TD>{s.customerName}</TD>
                  <TD numeric data-numeric="">
                    {centsToDecimalString(s.totalCents)} {s.currency}
                  </TD>
                  <TD numeric data-numeric="">
                    {s.status === "confirmed" && balance > 0n
                      ? `${centsToDecimalString(balance)} ${s.currency}`
                      : "—"}
                  </TD>
                  <TD>
                    <Badge tone={ESTADO_TONE[s.estadoCobro]}>
                      {t(`payStatus.${s.estadoCobro}`)}
                    </Badge>
                  </TD>
                </TRow>
              );
            })}
          </TBody>
        </DataTable>
      )}
    </PageLayout>
  );
}
