import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { accountsReceivable } from "@/features/sales/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";

// Suma de saldos por moneda (los documentos viven en su moneda propia;
// consolidar a base es tarea del dashboard, aquí se reporta por moneda).
function totalsByCurrency(
  rows: Array<{ currency: string; balanceCents: bigint }>,
) {
  const map = new Map<string, bigint>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? 0n) + r.balanceCents);
  }
  return [...map.entries()];
}

export default async function ReceivablesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.receivables");
  const locale = await getLocale();
  const rows = await accountsReceivable(getDb(), orgId);
  const now = new Date();
  const fmtDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {totalsByCurrency(rows).map(([currency, cents]) => (
            <span
              key={currency}
              className="rounded-full bg-secondary px-3 py-1 text-sm font-medium"
            >
              {t("pending")}: {centsToDecimalString(cents)} {currency}
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nº</th>
                <th className="px-4 py-2 font-medium">{t("customer")}</th>
                <th className="px-4 py-2 font-medium">{t("due")}</th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("total")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("paid")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("balance")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((s) => {
                const overdue = s.dueDate && s.dueDate < now;
                return (
                  <tr key={s.id} className="hover:bg-accent">
                    <td className="px-4 py-2" data-numeric="">
                      <Link
                        href={`/sales/${s.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {s.series}-{s.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{s.customerName}</td>
                    <td className="px-4 py-2">
                      {s.dueDate ? (
                        <span
                          className={
                            overdue ? "font-medium text-destructive" : undefined
                          }
                        >
                          {fmtDate.format(s.dueDate)}
                          {overdue ? ` · ${t("overdue")}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right" data-numeric="">
                      {centsToDecimalString(s.totalCents)} {s.currency}
                    </td>
                    <td className="px-4 py-2 text-right" data-numeric="">
                      {centsToDecimalString(s.paidCents)} {s.currency}
                    </td>
                    <td
                      className="px-4 py-2 text-right font-medium"
                      data-numeric=""
                    >
                      {centsToDecimalString(s.balanceCents)} {s.currency}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
