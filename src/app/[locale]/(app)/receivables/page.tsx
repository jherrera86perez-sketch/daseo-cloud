import { getTranslations, getLocale } from "next-intl/server";
import { TH } from "@/components/ui/data-table";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  cobrosResumen,
  accountsReceivableGrouped,
} from "@/features/sales/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";

// Port fiel de "Cuentas por Cobrar" del ERP: ventas con saldo agrupadas por
// cliente, con días de atraso desde la FECHA DE VENTA (vencida = >14 días:
// 7 normales + 7 de tregua) y resumen de cobranza arriba.

function atrasoBadge(dias: number): string {
  if (dias > 60)
    return "bg-destructive/10 text-destructive animate-pulse font-semibold";
  if (dias > 14) return "bg-destructive/10 text-destructive";
  if (dias > 7) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-secondary text-muted-foreground";
}

export default async function ReceivablesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ tipo?: string }> }>) {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.receivables");
  const locale = await getLocale();
  const sp = await searchParams;
  const tipo = sp.tipo === "CLIENTE" || sp.tipo === "PDV" ? sp.tipo : undefined;
  const db = getDb();
  const [resumen, grupos] = await Promise.all([
    cobrosResumen(db, orgId),
    accountsReceivableGrouped(db, orgId, tipo),
  ]);
  const fmtDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="t-display text-2xl tracking-[-0.025em]">
            {t("title")}
          </h1>
          <p className="t-display-italic mt-1.5 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {/* ERP: tipo=CLIENTE|PDV agrupa CxC bajo su propio filtro */}
        <div className="flex rounded-md border p-0.5 text-sm">
          {(
            [
              [undefined, t("typeAll")],
              ["CLIENTE", t("typeCliente")],
              ["PDV", t("typePdv")],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={label}
              href={v ? `/receivables?tipo=${v}` : "/receivables"}
              className={`rounded px-3 py-1 ${tipo === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Resumen de cobranza (GET /cobros/resumen del ERP) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-md border border-border bg-card p-4">
          <p className="t-eyebrow">{t("totalOwed")}</p>
          <p className="t-num-display mt-1 text-[20px]" data-numeric="">
            {centsToDecimalString(resumen.total_adeudado_base_cents)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="t-eyebrow">{t("numSales")}</p>
          <p className="t-num-display mt-1 text-[20px]" data-numeric="">
            {resumen.num_ventas}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="t-eyebrow">{t("numCustomers")}</p>
          <p className="t-num-display mt-1 text-[20px]" data-numeric="">
            {resumen.num_clientes}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="t-eyebrow">{t("maxDays")}</p>
          <p className="t-num-display mt-1 text-[20px]" data-numeric="">
            {resumen.max_dias_atraso}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="t-eyebrow">{t("overdueCount")}</p>
          <p
            className={`t-num-display mt-1 text-[20px] ${resumen.num_vencidas > 0 ? "text-destructive" : ""}`}
            data-numeric=""
          >
            {resumen.num_vencidas}
          </p>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        grupos.map((g) => (
          <section key={g.customerId} className="rounded-md border">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{g.customerName}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${atrasoBadge(g.max_dias_atraso)}`}
                >
                  {t("daysLate", { days: g.max_dias_atraso })}
                </span>
              </div>
              <span className="text-sm font-bold" data-numeric="">
                {t("groupBalance")}: {centsToDecimalString(g.saldo_base_cents)}
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-surface-100 text-left">
                  <tr>
                    <TH>Nº</TH>
                    <TH>{t("saleDate")}</TH>
                    <TH>{t("daysLateCol")}</TH>
                    <TH numeric>{t("total")}</TH>
                    <TH numeric>{t("paid")}</TH>
                    <TH numeric>{t("balance")}</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {g.ventas.map((s) => (
                    <tr
                      key={s.id}
                      className="transition-colors hover:bg-surface-hover"
                    >
                      <td data-numeric="">
                        <Link
                          href={`/sales/${s.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {s.series}-{s.number}
                        </Link>
                      </td>
                      <td className="text-muted-foreground">
                        {fmtDate.format(s.soldAt ?? s.createdAt)}
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${atrasoBadge(s.dias_atraso)}`}
                        >
                          {s.dias_atraso}
                        </span>
                      </td>
                      <td className="text-right" data-numeric="">
                        {centsToDecimalString(s.totalCents)} {s.currency}
                      </td>
                      <td className="text-right" data-numeric="">
                        {centsToDecimalString(s.paidCents)}
                      </td>
                      <td className="text-right font-medium" data-numeric="">
                        {centsToDecimalString(s.balanceCents)} {s.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
      <p className="text-xs text-muted-foreground">{t("consolidatedNote")}</p>
    </div>
  );
}
