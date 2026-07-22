import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  getFiscalSettings,
  listMonthObligations,
  dj08Projection,
} from "@/features/fiscal/queries";
import {
  FiscalSettingsForm,
  ComputeMonthButton,
  MarkPaidButton,
} from "@/features/fiscal/fiscal-ui";
import { centsToDecimalString } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FiscalPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.fiscal");
  const db = getDb();
  const { country, settings } = await getFiscalSettings(db, orgId);
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const obligations = country
    ? await listMonthObligations(db, orgId, year, month)
    : [];
  const dj = country ? await dj08Projection(db, orgId, year) : null;

  const pendingTotal = obligations
    .filter((o) => o.status === "pending")
    .reduce((acc, o) => acc + o.amountCents, 0n);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("settingsTitle")} (ONAT · Cuba)</CardTitle>
        </CardHeader>
        <CardContent>
          <FiscalSettingsForm
            initial={{
              regime: settings.regime ?? "TCP_GENERAL",
              nit: settings.nit ?? "",
              payroll: settings.monthlyPayrollCents
                ? centsToDecimalString(BigInt(settings.monthlyPayrollCents))
                : "",
              quota: settings.fixedQuotaCents
                ? centsToDecimalString(BigInt(settings.fixedQuotaCents))
                : "",
              minExempt: settings.minExemptCents
                ? centsToDecimalString(BigInt(settings.minExemptCents))
                : "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            {t("monthTitle", { month, year })}
            <ComputeMonthButton year={year} month={month} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {obligations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noObligations")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t("code")}</th>
                    <th className="py-2 pr-3 font-medium">{t("concept")}</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t("base")}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t("amount")}
                    </th>
                    <th className="py-2 font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {obligations.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-3" data-numeric="">
                        {o.conceptCode}
                      </td>
                      <td className="py-2 pr-3">{o.name}</td>
                      <td className="py-2 pr-3 text-right" data-numeric="">
                        {centsToDecimalString(o.baseCents)}
                      </td>
                      <td
                        className="py-2 pr-3 text-right font-medium"
                        data-numeric=""
                      >
                        {centsToDecimalString(o.amountCents)}
                      </td>
                      <td className="py-2">
                        {o.status === "paid" ? (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                            {t("paid")}
                          </span>
                        ) : (
                          <MarkPaidButton id={o.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pendingTotal > 0n && (
                <p className="mt-3 text-right font-bold" data-numeric="">
                  {t("pendingTotal")}: {centsToDecimalString(pendingTotal)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {dj && (
        <Card>
          <CardHeader>
            <CardTitle>{t("djTitle", { year })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("income")}</p>
                <p className="font-bold" data-numeric="">
                  {centsToDecimalString(dj.incomeCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("deductible")}
                </p>
                <p className="font-bold" data-numeric="">
                  {centsToDecimalString(dj.deductibleCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("netBase")}</p>
                <p className="font-bold" data-numeric="">
                  {centsToDecimalString(dj.netBaseCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("djBalance")}
                </p>
                <p className="font-bold text-primary" data-numeric="">
                  {centsToDecimalString(dj.balanceCents)}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("bracket")}</th>
                    <th className="py-1 pr-3 text-right font-medium">%</th>
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("taxedBase")}
                    </th>
                    <th className="py-1 text-right font-medium">{t("tax")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dj.brackets.map((b) => (
                    <tr key={b.fromCents.toString()}>
                      <td className="py-1 pr-3" data-numeric="">
                        {centsToDecimalString(b.fromCents)} –{" "}
                        {b.toCents >= 999_999_999_900n
                          ? "∞"
                          : centsToDecimalString(b.toCents)}
                      </td>
                      <td className="py-1 pr-3 text-right" data-numeric="">
                        {(b.rate * 100).toFixed(0)}%
                      </td>
                      <td className="py-1 pr-3 text-right" data-numeric="">
                        {centsToDecimalString(b.taxedCents)}
                      </td>
                      <td
                        className="py-1 text-right font-medium"
                        data-numeric=""
                      >
                        {centsToDecimalString(b.taxCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("djNote")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
