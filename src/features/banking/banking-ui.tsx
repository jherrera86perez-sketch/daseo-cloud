"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBankAccountAction,
  importCsvAction,
  linkMovementAction,
  ignoreMovementAction,
  type ActionState,
} from "./actions";

export function NewAccountForm() {
  const t = useTranslations("app.banking");
  const [state, formAction, pending] = useActionState(
    createBankAccountAction,
    null,
  );
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="b-name">{t("accountName")}</Label>
        <Input id="b-name" name="name" required className="w-56" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b-currency">{t("currency")}</Label>
        <select
          id="b-currency"
          name="currency"
          className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
          defaultValue="CUP"
        >
          {["CUP", "USD", "BRL"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t("addAccount")}
      </Button>
    </form>
  );
}

export function ImportCsvForm({ accountId }: Readonly<{ accountId: string }>) {
  const t = useTranslations("app.banking");
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await importCsvAction(accountId, prev, form);
      if (res?.ok) {
        ref.current?.reset();
        toast.success(res.ok);
      }
      return res;
    },
    null,
  );
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="csv">{t("importLabel")}</Label>
      <textarea
        id="csv"
        name="csv"
        rows={5}
        required
        placeholder={t("importPlaceholder")}
        className="border-input w-full rounded-md border bg-transparent p-2 font-mono text-xs"
      />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "…" : t("import")}
      </Button>
    </form>
  );
}

export function MovementActions({
  movementId,
  suggestions,
}: Readonly<{
  movementId: string;
  suggestions: Array<{
    kind: string;
    paymentId: string;
    score: number;
    label: string;
  }>;
}>) {
  const t = useTranslations("app.banking");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ActionState>) {
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else toast.success(t("linked"));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {suggestions.map((s) => (
        <Button
          key={s.paymentId}
          size="sm"
          variant="outline"
          disabled={pending}
          title={`score ${s.score}`}
          onClick={() =>
            run(() => linkMovementAction(movementId, s.kind, s.paymentId))
          }
        >
          {t("link")}: {s.label}
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await ignoreMovementAction(movementId);
            if (res?.error) toast.error(res.error);
          })
        }
      >
        {t("ignore")}
      </Button>
    </div>
  );
}
