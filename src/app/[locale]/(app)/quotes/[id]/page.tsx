import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getQuoteDetail } from "@/features/quotes/queries";
import { QuoteActions } from "@/features/quotes/quote-actions";
import { centsToDecimalString } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function QuoteDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.quotes");
  const { quote, items } = await getQuoteDetail(getDb(), orgId, id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {quote.series}-{quote.number}
          <span className="ml-3 align-middle rounded-full bg-secondary px-2 py-0.5 text-xs font-normal">
            {t(`statuses.${quote.status}`)}
          </span>
        </h1>
        <QuoteActions quoteId={id} status={quote.status} />
      </div>

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
                    {centsToDecimalString(i.unitPriceCents)}
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
                  {centsToDecimalString(quote.totalCents)} {quote.currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
