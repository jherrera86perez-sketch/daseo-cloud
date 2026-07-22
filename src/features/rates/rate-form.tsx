"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addRateAction, type ActionState } from "@/features/sales/actions";

export function RateForm() {
  const t = useTranslations("app.rates");
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await addRateAction(prev, form);
      if (!res?.error) {
        ref.current?.reset();
        toast.success(t("saved"));
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
      <select
        name="currency"
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        defaultValue="USD"
      >
        {["USD", "BRL", "CUP"].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Input
        name="rate"
        inputMode="decimal"
        placeholder={t("placeholder")}
        required
        className="w-32"
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "…" : t("add")}
      </Button>
    </form>
  );
}
