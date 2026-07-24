import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  getFiscalSettings,
  listMonthObligations,
  dj08Projection,
  incomeSourceDetail,
  gapAnalysis,
  onatApartarEstimate,
} from "@/features/fiscal/queries";
import {
  FiscalSettingsForm,
  ComputeMonthButton,
  MarkPaidButton,
  ConfidenceBadge,
} from "@/features/fiscal/fiscal-ui";
import { centsToDecimalString } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatSignedCents(cents: bigint): string {
  return cents < 0n
    ? `-${centsToDecimalString(-cents)}`
    : centsToDecimalString(cents);
}

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
  const income = country
    ? await incomeSourceDetail(db, orgId, year, month)
    : null;
  const gap = country ? await gapAnalysis(db, orgId, year) : null;
  const apartar = country
    ? await onatApartarEstimate(db, orgId, year, month)
    : null;

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
              exentoFotovoltaico: settings.exentoFotovoltaico ?? false,
            }}
          />
        </CardContent>
      </Card>

      {apartar && apartar.incomeCents > 0n && (
        <Card>
          <CardHeader>
            <CardTitle>{t("apartarTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("income")}</p>
              <p className="font-bold" data-numeric="">
                {centsToDecimalString(apartar.incomeCents)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("apartarRate")}
              </p>
              <p className="font-bold" data-numeric="">
                {(apartar.rate * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("apartarAmount")}
              </p>
              <p className="font-bold text-primary" data-numeric="">
                {centsToDecimalString(apartar.apartarCents)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              {t("monthTitle", { month, year })}
              {income && <ConfidenceBadge confidence={income.confidence} />}
            </span>
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
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t("income")}
                  <ConfidenceBadge confidence={dj.incomeConfidence} />
                </p>
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

      {gap && (
        <Card>
          <CardHeader>
            <CardTitle>{t("gapTitle", { year })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("gapMonth")}</th>
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("gapVentas")}
                    </th>
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("gapBanco")}
                    </th>
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("gapBrecha")}
                    </th>
                    <th className="py-1 text-right font-medium">
                      {t("gapPct")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {gap.months
                    .filter(
                      (m) =>
                        m.ventasInternasCents > 0n ||
                        m.ingresosBancariosCents > 0n,
                    )
                    .map((m) => (
                      <tr key={m.mes}>
                        <td className="py-1 pr-3" data-numeric="">
                          {m.mes}/{m.anio}
                        </td>
                        <td className="py-1 pr-3 text-right" data-numeric="">
                          {centsToDecimalString(m.ventasInternasCents)}
                        </td>
                        <td className="py-1 pr-3 text-right" data-numeric="">
                          {centsToDecimalString(m.ingresosBancariosCents)}
                        </td>
                        <td className="py-1 pr-3 text-right" data-numeric="">
                          {formatSignedCents(m.brechaCents)}
                        </td>
                        <td className="py-1 text-right" data-numeric="">
                          {m.porcentajeBancarizado === null
                            ? "—"
                            : `${m.porcentajeBancarizado.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  <tr className="font-bold">
                    <td className="py-1 pr-3">Total</td>
                    <td className="py-1 pr-3 text-right" data-numeric="">
                      {centsToDecimalString(gap.totals.ventasInternasCents)}
                    </td>
                    <td className="py-1 pr-3 text-right" data-numeric="">
                      {centsToDecimalString(gap.totals.ingresosBancariosCents)}
                    </td>
                    <td className="py-1 pr-3 text-right" data-numeric="">
                      {formatSignedCents(gap.totals.brechaCents)}
                    </td>
                    <td className="py-1 text-right" data-numeric="">
                      {gap.totals.porcentajeBancarizado === null
                        ? "—"
                        : `${gap.totals.porcentajeBancarizado.toFixed(1)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("gapNote")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
