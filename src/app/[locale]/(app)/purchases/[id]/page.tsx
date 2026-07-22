import { getTranslations, getFormatter } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getPurchaseDetail } from "@/features/purchases/queries";
import { PurchaseDetailActions } from "@/features/purchases/purchase-detail-actions";
import { PaymentForm } from "@/features/sales/sale-detail-actions";
import { addSupplierPaymentAction } from "@/features/purchases/actions";
import { centsToDecimalString } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PurchaseDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.purchases");
  const format = await getFormatter();
  const { purchase, items, payments, balanceCents } = await getPurchaseDetail(
    getDb(),
    orgId,
    id,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {purchase.number
            ? `${purchase.series}-${purchase.number}`
            : t("draft")}
          <span className="ml-3 align-middle rounded-full bg-secondary px-2 py-0.5 text-xs font-normal">
            {t(`statuses.${purchase.status}`)}
          </span>
        </h1>
        <PurchaseDetailActions purchaseId={id} status={purchase.status} />
      </div>
      <p className="text-sm text-muted-foreground">{purchase.supplierName}</p>

      <Card>
        <CardHeader>
          <CardTitle>{t("lines")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-2">{i.description}</td>
                  <td className="py-2 pr-2 text-right" data-numeric="">
                    {i.qty}
                  </td>
                  <td className="py-2 pr-2 text-right" data-numeric="">
                    {centsToDecimalString(i.unitCostCents)}
                  </td>
                  <td className="py-2 text-right font-medium" data-numeric="">
                    {centsToDecimalString(i.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td colSpan={3} className="py-2 text-right font-medium">
                  {t("total")}
                </td>
                <td
                  className="py-2 text-right text-lg font-bold"
                  data-numeric=""
                >
                  {centsToDecimalString(purchase.totalCents)}{" "}
                  {purchase.currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {purchase.status === "confirmed" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("payments")} —{" "}
              <span data-numeric="">
                {t("balance")}: {centsToDecimalString(balanceCents)}{" "}
                {purchase.currency}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {balanceCents > 0n && (
              <PaymentForm
                saleId={id}
                saleCurrency={purchase.currency}
                action={addSupplierPaymentAction.bind(null, id)}
              />
            )}
            {payments.length > 0 && (
              <ul className="divide-y text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span>
                      {format.dateTime(p.paidAt, { dateStyle: "medium" })}
                    </span>
                    <span data-numeric="">
                      {centsToDecimalString(p.amountCents)} {p.currency}
                      {p.currency !== purchase.currency &&
                        ` → ${centsToDecimalString(p.appliedCents)} ${purchase.currency}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {balanceCents === 0n && (
              <p className="text-sm font-medium text-success">{t("paid")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
