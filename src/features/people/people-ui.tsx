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
