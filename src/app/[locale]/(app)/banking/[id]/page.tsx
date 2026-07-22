import { getTranslations, getFormatter } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  getOwnedAccount,
  listMovements,
  matchSuggestions,
  type MatchSuggestion,
} from "@/features/banking/queries";
import { ImportCsvForm, MovementActions } from "@/features/banking/banking-ui";
import { centsToDecimalString } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BankAccountPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.banking");
  const format = await getFormatter();
  const db = getDb();
  const account = await getOwnedAccount(db, orgId, id);
  const movements = await listMovements(db, orgId, id);

  // sugerencias solo para pendientes (máx. 15 para no cargar de más)
  const pending = movements.filter((m) => m.status === "pending").slice(0, 15);
  const suggestionsByMovement = new Map<string, MatchSuggestion[]>();
  for (const m of pending) {
    suggestionsByMovement.set(
      m.id,
      (await matchSuggestions(db, orgId, m.id)).slice(0, 3),
    );
  }

  const balance = movements
    .filter((m) => m.status !== "ignored")
    .reduce((acc, m) => acc + m.amountCents, 0n);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{account.name}</h1>
        <p className="text-lg font-bold" data-numeric="">
          {t("importedBalance")}:{" "}
          {balance < 0n
            ? `-${centsToDecimalString(-balance)}`
            : centsToDecimalString(balance)}{" "}
          {account.currency}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("importTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportCsvForm accountId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("movements")}</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMovements")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t("date")}</th>
                    <th className="py-2 pr-3 font-medium">
                      {t("description")}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t("amount")}
                    </th>
                    <th className="py-2 font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3" data-numeric="">
                        {format.dateTime(new Date(m.movementDate), {
                          dateStyle: "short",
                        })}
                      </td>
                      <td className="py-2 pr-3">{m.description}</td>
                      <td
                        className={`py-2 pr-3 text-right font-medium ${
                          m.amountCents < 0n
                            ? "text-destructive"
                            : "text-success"
                        }`}
                        data-numeric=""
                      >
                        {m.amountCents < 0n
                          ? `-${centsToDecimalString(-m.amountCents)}`
                          : centsToDecimalString(m.amountCents)}
                      </td>
                      <td className="py-2">
                        {m.status === "pending" ? (
                          <MovementActions
                            movementId={m.id}
                            suggestions={(
                              suggestionsByMovement.get(m.id) ?? []
                            ).map((s) => ({
                              kind: s.kind,
                              paymentId: s.paymentId,
                              score: s.score,
                              label: s.label,
                            }))}
                          />
                        ) : (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                            {t(`statuses.${m.status}`)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
