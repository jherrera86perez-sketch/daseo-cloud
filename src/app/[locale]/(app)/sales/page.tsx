import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listSales } from "@/features/sales/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function SalesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.sales");
  const rows = await listSales(getDb(), orgId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/sales/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>

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
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {t(`statuses.${s.status}`)}
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
  );
}
