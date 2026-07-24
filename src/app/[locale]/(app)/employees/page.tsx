import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  listEmployees,
  activePayrollCents,
  evaluationSummary,
} from "@/features/people/queries";
import {
  NewEmployeeForm,
  EmployeeRowActions,
  EvaluationCell,
  DayObservationForm,
} from "@/features/people/people-ui";
import { centsToDecimalString } from "@/lib/money";

export default async function EmployeesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.employees");
  const db = getDb();
  const [rows, payroll, evals] = await Promise.all([
    listEmployees(db, orgId),
    activePayrollCents(db, orgId),
    evaluationSummary(db, orgId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground" data-numeric="">
          {t("payrollTotal")}: <strong>{centsToDecimalString(payroll)}</strong>
        </p>
      </div>
      <NewEmployeeForm />
      <DayObservationForm
        employees={rows
          .filter((e) => e.active === "yes")
          .map((e) => ({ id: e.id, name: e.name }))}
      />
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{t("name")}</th>
                <th className="px-4 py-2 font-medium">{t("role")}</th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("salary")}
                </th>
                <th className="px-4 py-2 font-medium">{t("status")}</th>
                <th className="px-4 py-2 font-medium">{t("evaluation")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className={e.active === "no" ? "opacity-60" : ""}
                >
                  <td className="px-4 py-2 font-medium">{e.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.role ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right" data-numeric="">
                    {centsToDecimalString(e.salaryCents)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {e.active === "yes" ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <EvaluationCell
                      employeeId={e.id}
                      summary={evals.get(e.id) ?? null}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <EmployeeRowActions id={e.id} active={e.active === "yes"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("fiscalNote")}</p>
    </div>
  );
}
