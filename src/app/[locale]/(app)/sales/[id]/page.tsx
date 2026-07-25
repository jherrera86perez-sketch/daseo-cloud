import { getTranslations, getFormatter } from "next-intl/server";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { organizations, customers } from "@/db/schema";
import { getSaleDetail, paymentStatus } from "@/features/sales/queries";
import {
  ConfirmCancelButtons,
  PaymentForm,
} from "@/features/sales/sale-detail-actions";
import { PrintNoteButton } from "@/features/sales/print-note";
import { centsToDecimalString } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SaleDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.sales");
  const format = await getFormatter();
  const db = getDb();
  const { sale, items, payments, paidCents, balanceCents } =
    await getSaleDetail(db, orgId, id);
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const [cust] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, sale.customerId));
  const estadoCobro = paymentStatus(sale, paidCents);
  const numero = sale.number ? `${sale.series}-${sale.number}` : t("draft");
  const subtotalCents = sale.totalCents - sale.taxCents + sale.discountCents;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="t-display text-2xl tracking-[-0.025em]">
          {numero}
          <span className="ml-3 align-middle rounded-full bg-secondary px-2 py-0.5 text-xs font-normal">
            {t(`payStatus.${estadoCobro}`)}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {sale.status === "confirmed" && (
            <PrintNoteButton
              data={{
                numero,
                fecha: format.dateTime(sale.soldAt ?? sale.createdAt, {
                  dateStyle: "medium",
                }),
                cliente: cust?.name ?? "",
                moneda: sale.currency,
                lineas: items.map((i) => ({
                  descripcion: i.description,
                  qty: i.qty,
                  precio: centsToDecimalString(i.unitPriceCents),
                  total: centsToDecimalString(i.totalCents),
                })),
                subtotal: centsToDecimalString(subtotalCents),
                iva:
                  sale.taxCents > 0n
                    ? centsToDecimalString(sale.taxCents)
                    : null,
                descuento:
                  sale.discountCents > 0n
                    ? centsToDecimalString(sale.discountCents)
                    : null,
                total: centsToDecimalString(sale.totalCents),
                cobrado: centsToDecimalString(paidCents),
                saldo: centsToDecimalString(balanceCents),
                poNumber: sale.poNumber,
                nota: sale.note,
                org: org?.name ?? "Daseo Cloud",
              }}
            />
          )}
          <ConfirmCancelButtons saleId={id} status={sale.status} />
        </div>
      </div>

      {(sale.poNumber || sale.note) && (
        <p className="text-sm text-muted-foreground">
          {sale.poNumber && (
            <>
              {t("poNumber")}: <strong>{sale.poNumber}</strong>
              {sale.note && " · "}
            </>
          )}
          {sale.note}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("lines")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-surface-100">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-2">{i.description}</td>
                  <td className="py-2 pr-2 text-right" data-numeric="">
                    {i.qty}
                  </td>
                  <td className="py-2 pr-2 text-right" data-numeric="">
                    {centsToDecimalString(i.unitPriceCents)}
                  </td>
                  <td className="py-2 text-right font-medium" data-numeric="">
                    {centsToDecimalString(i.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {(sale.discountCents > 0n || sale.taxCents > 0n) && (
                <>
                  <tr className="border-t">
                    <td colSpan={3} className="py-1 text-right text-xs">
                      {t("subtotal")}
                    </td>
                    <td className="py-1 text-right text-xs" data-numeric="">
                      {centsToDecimalString(subtotalCents)}
                    </td>
                  </tr>
                  {sale.taxCents > 0n && (
                    <tr>
                      <td colSpan={3} className="py-1 text-right text-xs">
                        IVA
                      </td>
                      <td className="py-1 text-right text-xs" data-numeric="">
                        {centsToDecimalString(sale.taxCents)}
                      </td>
                    </tr>
                  )}
                  {sale.discountCents > 0n && (
                    <tr>
                      <td colSpan={3} className="py-1 text-right text-xs">
                        {t("discount")}
                      </td>
                      <td className="py-1 text-right text-xs" data-numeric="">
                        −{centsToDecimalString(sale.discountCents)}
                      </td>
                    </tr>
                  )}
                </>
              )}
              <tr className="border-t">
                <td colSpan={3} className="py-2 text-right font-medium">
                  {t("total")}
                </td>
                <td
                  className="py-2 text-right text-lg font-bold"
                  data-numeric=""
                >
                  {centsToDecimalString(sale.totalCents)} {sale.currency}
                </td>
              </tr>
              {sale.currency !== "CUP" && (
                <tr>
                  <td
                    colSpan={3}
                    className="text-right text-xs text-muted-foreground"
                  >
                    {t("rateFixed")}
                  </td>
                  <td
                    className="text-right text-xs text-muted-foreground"
                    data-numeric=""
                  >
                    ×{sale.rateToBaseFixed} ={" "}
                    {centsToDecimalString(sale.totalBaseCents)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {sale.status === "confirmed" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("payments")} —{" "}
              <span data-numeric="">
                {t("balance")}: {centsToDecimalString(balanceCents)}{" "}
                {sale.currency}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {balanceCents > 0n && (
              <PaymentForm
                saleId={id}
                saleCurrency={sale.currency}
                balance={centsToDecimalString(balanceCents)}
              />
            )}
            {payments.length > 0 && (
              <ul className="divide-y text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span>
                      {format.dateTime(p.paidAt, { dateStyle: "medium" })} ·{" "}
                      {t(`methods.${p.method}`)}
                    </span>
                    <span data-numeric="">
                      {centsToDecimalString(p.amountCents)} {p.currency}
                      {p.currency !== sale.currency &&
                        ` → ${centsToDecimalString(p.appliedCents)} ${sale.currency}`}
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
