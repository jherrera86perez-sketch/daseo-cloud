import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { accountsPayableGrouped } from "@/features/purchases/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { SinDeudaButton } from "@/features/purchases/sin-deuda-button";

// Port fiel de "Cuentas por Pagar" del ERP: compras con saldo agrupadas por
// proveedor (con referencia bancaria), días de atraso desde la compra, panel
// por rango de atraso y acción "Sin deuda".

function atrasoBadge(dias: number): string {
  if (dias > 60)
    return "bg-destructive/10 text-destructive animate-pulse font-semibold";
  if (dias > 30) return "bg-destructive/10 text-destructive";
  if (dias > 7) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-secondary text-muted-foreground";
}

export default async function PayablesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.payables");
  const locale = await getLocale();
  const grupos = await accountsPayableGrouped(getDb(), orgId);
  const fmtDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  const totalBase = grupos.reduce(
    (s, g) => s + g.total_adeudado_base_cents,
    0n,
  );
  const todas = grupos.flatMap((g) => g.compras);
  // Rangos de atraso del ERP: Al día ≤7d · 8-30d · 31-60d · Crítico 60+d
  const rangos = [
    [t("range0"), todas.filter((c) => c.dias_atraso <= 7).length],
    [
      t("range1"),
      todas.filter((c) => c.dias_atraso > 7 && c.dias_atraso <= 30).length,
    ],
    [
      t("range2"),
      todas.filter((c) => c.dias_atraso > 30 && c.dias_atraso <= 60).length,
    ],
    [t("range3"), todas.filter((c) => c.dias_atraso > 60).length],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {grupos.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="font-medium">{t("cleanTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("cleanBody")}</p>
            </div>
          ) : (
            grupos.map((g) => (
              <section key={g.supplierId} className="rounded-md border">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g.supplierName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${atrasoBadge(g.max_dias_atraso)}`}
                    >
                      {g.max_dias_atraso > 0
                        ? t("daysLate", { days: g.max_dias_atraso })
                        : t("onTime")}
                    </span>
                    {g.bankAccount && (
                      <span className="text-xs text-muted-foreground">
                        🏦 {g.bankAccount}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold" data-numeric="">
                    {t("groupBalance")}:{" "}
                    {centsToDecimalString(g.total_adeudado_base_cents)}
                  </span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left">
                      <tr>
                        <th className="px-4 py-2 font-medium">Nº</th>
                        <th className="px-4 py-2 font-medium">
                          {t("invoiceCol")}
                        </th>
                        <th className="px-4 py-2 font-medium">{t("date")}</th>
                        <th className="px-4 py-2 font-medium">{t("due")}</th>
                        <th className="px-4 py-2 font-medium">
                          {t("daysCol")}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          {t("total")}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          {t("paid")}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          {t("balance")}
                        </th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {g.compras.map((c) => (
                        <tr key={c.id} className="hover:bg-accent">
                          <td className="px-4 py-2" data-numeric="">
                            <Link
                              href={`/purchases/${c.id}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {c.series}-{c.number}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {c.supplierInvoice ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {fmtDate.format(c.receivedAt ?? c.createdAt)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {c.dueDate ? fmtDate.format(c.dueDate) : "—"}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${atrasoBadge(c.dias_atraso)}`}
                            >
                              {c.dias_atraso}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right" data-numeric="">
                            {centsToDecimalString(c.totalCents)} {c.currency}
                          </td>
                          <td className="px-4 py-2 text-right" data-numeric="">
                            {centsToDecimalString(c.paidCents)}
                          </td>
                          <td
                            className="px-4 py-2 text-right font-medium"
                            data-numeric=""
                          >
                            {centsToDecimalString(c.balanceCents)} {c.currency}
                          </td>
                          <td className="px-4 py-2">
                            <SinDeudaButton
                              purchaseId={c.id}
                              numero={`${c.series}-${c.number}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
          <p className="text-xs text-muted-foreground">{t("tip")}</p>
        </div>

        {/* Panel lateral (CuentasPorPagarSummaryPanel del ERP) */}
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("panelTotal")}
            </p>
            <p className="text-xl font-bold" data-numeric="">
              {centsToDecimalString(totalBase)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("panelTop")}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {grupos.slice(0, 3).map((g) => (
                <li key={g.supplierId} className="flex justify-between gap-2">
                  <span className="truncate">{g.supplierName}</span>
                  <span data-numeric="">
                    {centsToDecimalString(g.total_adeudado_base_cents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("panelRanges")}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {rangos.map(([label, n]) => (
                <li key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span data-numeric="">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
