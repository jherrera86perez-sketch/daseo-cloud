import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listPurchases } from "@/features/purchases/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function PurchasesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.purchases");
  const rows = await listPurchases(getDb(), orgId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/purchases/new">
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
                <th className="px-4 py-2 font-medium">{t("supplier")}</th>
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
              {rows.map((p) => {
                const balance = p.totalCents - p.paidCents;
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
                    <td className="px-4 py-2">{p.supplierName}</td>
                    <td className="px-4 py-2 text-right" data-numeric="">
                      {centsToDecimalString(p.totalCents)} {p.currency}
                    </td>
                    <td className="px-4 py-2 text-right" data-numeric="">
                      {p.status === "confirmed" && balance > 0n
                        ? `${centsToDecimalString(balance)} ${p.currency}`
                        : "—"}
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
  );
}
