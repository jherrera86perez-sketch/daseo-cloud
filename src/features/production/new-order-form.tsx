"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createOrderAction, type ActionState } from "./actions";

export function NewOrderForm({
  recipes,
}: Readonly<{ recipes: Array<{ id: string; name: string }> }>) {
  const t = useTranslations("app.production");
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => createOrderAction(prev, form),
    null,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <select
        name="recipeId"
        aria-label={t("recipe")}
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        required
      >
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t("newOrder")}
      </Button>
    </form>
  );
}
