"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOVEMENT_KINDS } from "./schemas";
import type { ActionState } from "./actions";

export function MovementForm({
  action,
}: Readonly<{
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}>) {
  const t = useTranslations("app.products");
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<string>("in");
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await action(prev, form);
      if (!res?.error) {
        ref.current?.reset();
        toast.success(t("movementSaved"));
      }
      return res;
    },
    null,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  const needsCost = kind === "in";

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <select
        name="kind"
        aria-label={t("movementKind")}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
      >
        {MOVEMENT_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`kinds.${k}`)}
          </option>
        ))}
        <option value="internal_out">{t("kinds.internal_out")}</option>
      </select>
      <Input
        name="qty"
        inputMode="decimal"
        placeholder={t("qty")}
        required
        className="sm:w-28"
      />
      <Input
        name="unitCost"
        inputMode="decimal"
        placeholder={t("unitCost")}
        required={needsCost}
        className="sm:w-32"
        title={t("unitCostHint")}
      />
      <Input name="note" placeholder={t("note")} className="flex-1" />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "…" : t("register")}
      </Button>
    </form>
  );
}
