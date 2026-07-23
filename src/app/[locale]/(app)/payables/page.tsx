import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { accountsPayable } from "@/features/purchases/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";

function totalsByCurrency(
  rows: Array<{ currency: string; balanceCents: bigint }>,
) {
  const map = new Map<string, bigint>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? 0n) + r.balanceCents);
  }
  return [...map.entries()];
}

export default async function PayablesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.payables");
  const locale = await getLocale();
  const rows = await accountsPayable(getDb(), orgId);
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
                <th className="px-4 py-2 font-medium">{t("supplier")}</th>
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
              {rows.map((p) => {
                const overdue = p.dueDate && p.dueDate < now;
                return (
                  <tr key={p.id} className="hover:bg-accent">
                    <td className="px-4 py-2" data-numeric="">
                      <Link
                        href={`/purchases/${p.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {p.series}-{p.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{p.supplierName}</td>
                    <td className="px-4 py-2">
                      {p.dueDate ? (
                        <span
                          className={
                            overdue ? "font-medium text-destructive" : undefined
                          }
                        >
                          {fmtDate.format(p.dueDate)}
                          {overdue ? ` · ${t("overdue")}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right" data-numeric="">
                      {centsToDecimalString(p.totalCents)} {p.currency}
                    </td>
                    <td className="px-4 py-2 text-right" data-numeric="">
                      {centsToDecimalString(p.paidCents)} {p.currency}
                    </td>
                    <td
                      className="px-4 py-2 text-right font-medium"
                      data-numeric=""
                    >
                      {centsToDecimalString(p.balanceCents)} {p.currency}
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
