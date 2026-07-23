"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAssistantAction, type ActionState } from "./actions";

export function AssistantCard({
  initial,
  baseCurrency,
}: Readonly<{
  initial: { salesGoal: string; overdueLimit: string };
  baseCurrency: string;
}>) {
  const t = useTranslations("app.assistant");
  const [, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await saveAssistantAction(prev, form);
      if (res?.error) toast.error(res.error);
      else toast.success(t("saved"));
      return res;
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="salesGoal">
          {t("salesGoal")} ({baseCurrency})
        </Label>
        <Input
          id="salesGoal"
          name="salesGoal"
          inputMode="decimal"
          defaultValue={initial.salesGoal}
          placeholder="0.00"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="overdueLimit">
          {t("overdueLimit")} ({baseCurrency})
        </Label>
        <Input
          id="overdueLimit"
          name="overdueLimit"
          inputMode="decimal"
          defaultValue={initial.overdueLimit}
          placeholder="0.00"
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "…" : t("save")}
      </Button>
    </form>
  );
}
