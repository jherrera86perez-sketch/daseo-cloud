"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToDecimalString } from "@/lib/money";
import { VEHICLE_CATEGORIES } from "./constants";
import {
  createVehicleAction,
  retireVehicleAction,
  type ActionState,
} from "./actions";
import type { VehicleRow } from "./queries";

export function VehicleForm() {
  const t = useTranslations("app.vehicles.form");
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await createVehicleAction(prev, form);
      if (!res?.error) toast.success(t("created"));
      return res;
    },
    null,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="v-plate">{t("plate")}</Label>
        <Input id="v-plate" name="plate" required className="w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="v-brand">{t("brand")}</Label>
        <Input id="v-brand" name="brand" className="w-32" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="v-model">{t("model")}</Label>
        <Input id="v-model" name="model" className="w-32" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="v-category">{t("category")}</Label>
        <select
          id="v-category"
          name="categoryCode"
          className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          {VEHICLE_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="v-date">{t("acquisitionDate")}</Label>
        <Input
          id="v-date"
          name="acquisitionDate"
          type="date"
          className="w-40"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t("save")}
      </Button>
    </form>
  );
}

export function VehiclesTable({
  vehicles,
}: Readonly<{ vehicles: VehicleRow[] }>) {
  const t = useTranslations("app.vehicles");
  const [pending, startRetire] = useTransition();
  const active = vehicles.filter((v) => v.status === "ACTIVE");

  if (vehicles.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-100 text-left">
          <tr>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("form.plate")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("form.brand")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("form.model")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("form.category")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
              {t("annualFee")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("status")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {vehicles.map((v) => {
            const cat = VEHICLE_CATEGORIES.find(
              (c) => c.code === v.categoryCode,
            );
            return (
              <tr key={v.id}>
                <td className="py-2 pr-3 font-medium">{v.plate}</td>
                <td className="py-2 pr-3">{v.brand}</td>
                <td className="py-2 pr-3">{v.model}</td>
                <td className="py-2 pr-3">{cat?.label ?? v.categoryCode}</td>
                <td className="py-2 pr-3 text-right" data-numeric="">
                  {centsToDecimalString(cat?.annualFeeCents ?? 0n)}
                </td>
                <td className="py-2 pr-3">
                  {v.status === "ACTIVE" ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                      {t("statuses.ACTIVE")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {t(`statuses.${v.status}`)}
                    </span>
                  )}
                </td>
                <td className="py-2">
                  {v.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startRetire(async () => {
                          const res = await retireVehicleAction(v.id);
                          if (res?.error) toast.error(res.error);
                        })
                      }
                    >
                      {t("retire")}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {active.length > 0 && (
        <p className="mt-3 text-right font-bold" data-numeric="">
          {t("totalAnnual")}:{" "}
          {centsToDecimalString(
            active.reduce(
              (sum, v) =>
                sum +
                (VEHICLE_CATEGORIES.find((c) => c.code === v.categoryCode)
                  ?.annualFeeCents ?? 0n),
              0n,
            ),
          )}
        </p>
      )}
    </div>
  );
}
