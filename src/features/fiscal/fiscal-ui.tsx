"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveFiscalSettingsAction,
  computeMonthAction,
  markPaidAction,
  type ActionState,
} from "./actions";

export function FiscalSettingsForm({
  initial,
}: Readonly<{
  initial: {
    regime: string;
    nit: string;
    payroll: string;
    quota: string;
    minExempt: string;
  };
}>) {
  const t = useTranslations("app.fiscal");
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await saveFiscalSettingsAction(prev, form);
      if (!res?.error) toast.success(t("saved"));
      return res;
    },
    null,
  );
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-regime">{t("regime")}</Label>
        <select
          id="f-regime"
          name="regime"
          defaultValue={initial.regime}
          className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="TCP_GENERAL">{t("regimes.general")}</option>
          <option value="TCP_SIMPLIFICADO">{t("regimes.simplified")}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-nit">NIT</Label>
        <Input
          id="f-nit"
          name="nit"
          defaultValue={initial.nit}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-payroll">{t("payroll")}</Label>
        <Input
          id="f-payroll"
          name="payroll"
          inputMode="decimal"
          defaultValue={initial.payroll}
          className="w-32"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-quota">{t("quota")}</Label>
        <Input
          id="f-quota"
          name="quota"
          inputMode="decimal"
          defaultValue={initial.quota}
          className="w-32"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-min">{t("minExempt")}</Label>
        <Input
          id="f-min"
          name="minExempt"
          inputMode="decimal"
          defaultValue={initial.minExempt}
          className="w-32"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t("save")}
      </Button>
    </form>
  );
}

export function ComputeMonthButton({
  year,
  month,
}: Readonly<{ year: number; month: number }>) {
  const t = useTranslations("app.fiscal");
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await computeMonthAction(year, month);
          if (res?.error) toast.error(res.error);
          else toast.success(t("computed"));
        })
      }
    >
      {pending ? "…" : t("compute")}
    </Button>
  );
}

/** ≈ badges de confianza del ERP (getIncomeSourceDetail): comunica de dónde
 * salió la base imponible, sin bloquear el flujo si es de baja confianza. */
export function ConfidenceBadge({
  confidence,
}: Readonly<{ confidence: "alta" | "media" | "baja" | "sin_datos" }>) {
  const t = useTranslations("app.fiscal");
  const styles: Record<string, string> = {
    alta: "bg-success/10 text-success",
    media: "bg-warning/10 text-warning",
    baja: "bg-destructive/10 text-destructive",
    sin_datos: "bg-muted text-muted-foreground",
  };
  return (
    <span
      title={t(`confidenceHint.${confidence}`)}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[confidence]}`}
    >
      {t(`confidence.${confidence}`)}
    </span>
  );
}

export function MarkPaidButton({ id }: Readonly<{ id: string }>) {
  const t = useTranslations("app.fiscal");
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await markPaidAction(id);
          if (res?.error) toast.error(res.error);
        })
      }
    >
      {pending ? "…" : t("markPaid")}
    </Button>
  );
}
