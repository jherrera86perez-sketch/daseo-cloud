/*
 * Cuerpo de Empleados, extraido para poder montarlo en dos sitios sin
 * duplicarlo: la ruta /employees y la seccion "Empleados" de Configuracion
 * (el ERP lo tiene dentro de Configuracion, no como item propio del menu).
 */
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

export async function EmployeesSection() {
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
      <div className="flex flex-wrap items-center justify-end gap-2">
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
        <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-surface-100 text-left">
              <tr>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("name")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("role")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                  {t("salary")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("status")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("evaluation")}
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
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
