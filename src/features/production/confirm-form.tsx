"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmOrderAction,
  cancelOrderAction,
  type ActionState,
} from "./actions";

type InputRow = {
  id: string;
  componentName?: string;
  componentUnit?: string;
  plannedQty: string;
};

export function ConfirmOrderForm({
  orderId,
  inputs,
  defaultOutput,
}: Readonly<{
  orderId: string;
  inputs: InputRow[];
  defaultOutput: string;
}>) {
  const t = useTranslations("app.production");
  const [producedQty, setProducedQty] = useState(defaultOutput);
  const [labor, setLabor] = useState("");
  const [overhead, setOverhead] = useState("");
  const [actuals, setActuals] = useState<Record<string, string>>(
    Object.fromEntries(inputs.map((i) => [i.id, i.plannedQty])),
  );
  const [cancelPending, startCancel] = useTransition();

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await confirmOrderAction(orderId, prev, form);
      if (res?.error) toast.error(res.error);
      else toast.success(t("confirmed"));
      return res;
    },
    null,
  );

  const payload = JSON.stringify({
    producedQty,
    labor,
    overhead,
    inputs: inputs.map((i) => ({
      inputId: i.id,
      actualQty: actuals[i.id] ?? i.plannedQty,
    })),
  });

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      <div className="flex flex-col gap-2">
        <Label>{t("actualInputs")}</Label>
        {inputs.map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1">
              {i.componentName}{" "}
              <span className="text-xs text-muted-foreground">
                ({t("planned")}: {i.plannedQty} {i.componentUnit})
              </span>
            </span>
            <Input
              aria-label={`${t("actual")} ${i.componentName}`}
              inputMode="decimal"
              value={actuals[i.id] ?? ""}
              onChange={(e) =>
                setActuals((a) => ({ ...a, [i.id]: e.target.value }))
              }
              className="w-28"
              required
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="produced">{t("producedQty")}</Label>
          <Input
            id="produced"
            inputMode="decimal"
            value={producedQty}
            onChange={(e) => setProducedQty(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="labor">{t("labor")}</Label>
          <Input
            id="labor"
            inputMode="decimal"
            placeholder="0.00"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="overhead">{t("overhead")}</Label>
          <Input
            id="overhead"
            inputMode="decimal"
            placeholder="0.00"
            value={overhead}
            onChange={(e) => setOverhead(e.target.value)}
          />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "…" : t("confirm")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive"
          disabled={cancelPending}
          onClick={() =>
            startCancel(async () => {
              const res = await cancelOrderAction(orderId);
              if (res?.error) toast.error(res.error);
            })
          }
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
