"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createEmployeeAction,
  toggleEmployeeAction,
  deleteEmployeeAction,
  createCommitmentAction,
  deactivateCommitmentAction,
  addEvaluationAction,
  saveDayObservationAction,
  type ActionState,
} from "./actions";

export function NewEmployeeForm() {
  const t = useTranslations("app.employees");
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await createEmployeeAction(prev, form);
      if (!res?.error) {
        ref.current?.reset();
        toast.success(t("created"));
      }
      return res;
    },
    null,
  );
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <Input name="name" placeholder={t("name")} required className="w-48" />
      <Input name="role" placeholder={t("role")} className="w-40" />
      <Input
        name="salary"
        inputMode="decimal"
        placeholder={t("salary")}
        required
        className="w-32"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t("add")}
      </Button>
    </form>
  );
}

export function EmployeeRowActions({
  id,
  active,
}: Readonly<{ id: string; active: boolean }>) {
  const t = useTranslations("app.employees");
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await toggleEmployeeAction(id);
            if (res?.error) toast.error(res.error);
          })
        }
      >
        {active ? t("deactivate") : t("activate")}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={t("remove")}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await deleteEmployeeAction(id);
            if (res?.error) toast.error(res.error);
          })
        }
      >
        <Trash2 className="size-4 text-destructive" aria-hidden />
      </Button>
    </div>
  );
}

export function CommitmentForm({
  customerId,
}: Readonly<{ customerId: string }>) {
  const t = useTranslations("app.commitments");
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await createCommitmentAction(customerId, prev, form);
      if (!res?.error) {
        ref.current?.reset();
        toast.success(t("created"));
      }
      return res;
    },
    null,
  );
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <Input
        name="description"
        placeholder={t("placeholder")}
        required
        className="min-w-48 flex-1"
      />
      <select
        name="frequency"
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        defaultValue="weekly"
      >
        <option value="weekly">{t("weekly")}</option>
        <option value="monthly">{t("monthly")}</option>
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "…" : t("add")}
      </Button>
    </form>
  );
}

export function DeactivateCommitmentButton({ id }: Readonly<{ id: string }>) {
  const t = useTranslations("app.commitments");
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await deactivateCommitmentAction(id);
          if (res?.error) toast.error(res.error);
        })
      }
    >
      {t("deactivate")}
    </Button>
  );
}

export function EvaluationCell({
  employeeId,
  summary,
}: Readonly<{
  employeeId: string;
  summary: { last: number; avg: number; count: number } | null;
}>) {
  const t = useTranslations("app.evaluations");
  const [, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await addEvaluationAction(prev, form);
      if (res?.error) toast.error(res.error);
      else toast.success(t("saved"));
      return res;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground" data-numeric="">
        {summary
          ? t("summary", {
              last: summary.last,
              avg: summary.avg,
              count: summary.count,
            })
          : t("none")}
      </span>
      <form action={formAction} className="flex items-center gap-1">
        <input type="hidden" name="employeeId" value={employeeId} />
        <select
          name="score"
          aria-label={t("score")}
          className="border-input h-7 rounded border bg-transparent px-1 text-xs"
          defaultValue="5"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Input
          name="notes"
          placeholder={t("notes")}
          aria-label={t("notes")}
          className="h-7 w-28 text-xs"
        />
        <Button size="sm" variant="outline" type="submit" disabled={pending}>
          {pending ? "…" : t("save")}
        </Button>
      </form>
    </div>
  );
}

/**
 * Observación manual del día (POST /observacion-dia del ERP): UPSERT por
 * (empleado, fecha) — merma/defectos/horas/órdenes que la producción no
 * registra por empleado. Complementa la evaluación automática.
 */
export function DayObservationForm({
  employees,
}: Readonly<{ employees: Array<{ id: string; name: string }> }>) {
  const t = useTranslations("app.employees");
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await saveDayObservationAction(prev, form);
      if (res?.error) toast.error(res.error);
      else {
        // mensaje literal del ERP: 'Observación creada' / 'Observación actualizada'
        toast.success((res as { ok?: string })?.ok ?? "");
        ref.current?.reset();
      }
      return res;
    },
    null,
  );
  void state;

  if (employees.length === 0) return null;
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t("dayObservation")}
      </summary>
      <form
        ref={ref}
        action={formAction}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-xs">
          {t("name")}
          <select
            name="employeeId"
            required
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("obsDate")}
          <Input name="fecha" type="date" defaultValue={hoyStr} required />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("obsOrders")}
          <Input name="ordenes" inputMode="numeric" className="w-20" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("obsWaste")}
          <Input name="merma" inputMode="decimal" className="w-20" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("obsDefects")}
          <Input name="defectos" inputMode="numeric" className="w-20" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("obsHours")}
          <Input name="horas" inputMode="decimal" className="w-20" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs">
          {t("notes")}
          <Input name="notas" />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : t("save")}
        </Button>
      </form>
    </details>
  );
}
