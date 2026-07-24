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

export type EmployeeOption = { id: string; name: string };

type LaborLine = { employeeId: string; hours: string; costHour: string };

export function ConfirmOrderForm({
  orderId,
  inputs,
  defaultOutput,
  employees = [],
}: Readonly<{
  orderId: string;
  inputs: InputRow[];
  defaultOutput: string;
  employees?: EmployeeOption[];
}>) {
  const t = useTranslations("app.production");
  const [producedQty, setProducedQty] = useState(defaultOutput);
  const [labor, setLabor] = useState("");
  const [overhead, setOverhead] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);
  const [actuals, setActuals] = useState<Record<string, string>>(
    Object.fromEntries(inputs.map((i) => [i.id, i.plannedQty])),
  );
  const [cancelPending, startCancel] = useTransition();

  const laborTotal = laborLines.reduce(
    (s, l) => s + (Number(l.hours.replace(",", ".")) || 0) * (Number(l.costHour.replace(",", ".")) || 0),
    0,
  );

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await confirmOrderAction(orderId, prev, form);
      if (res?.error) toast.error(res.error);
      else toast.success(t("confirmed"));
      return res;
    },
    null,
  );

  const validLines = laborLines.filter(
    (l) => l.employeeId && l.hours && l.costHour,
  );
  const payload = JSON.stringify({
    producedQty,
    labor,
    overhead,
    inputs: inputs.map((i) => ({
      inputId: i.id,
      actualQty: actuals[i.id] ?? i.plannedQty,
    })),
    wasteQty,
    laborLines: validLines.length > 0 ? validLines : undefined,
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <Label htmlFor="waste">{t("waste")}</Label>
          <Input
            id="waste"
            inputMode="decimal"
            placeholder="0"
            value={wasteQty}
            onChange={(e) => setWasteQty(e.target.value)}
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
            disabled={validLines.length > 0}
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

      {/* Mano de obra por empleado (produccion_mano_obra del ERP): si hay
          líneas, el devengado Σ horas×costo/hora reemplaza al monto manual */}
      {employees.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{t("laborLines")}</Label>
          {laborLines.map((line, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t("laborEmployee")}
                className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                value={line.employeeId}
                onChange={(e) =>
                  setLaborLines((ls) =>
                    ls.map((l, i) =>
                      i === idx ? { ...l, employeeId: e.target.value } : l,
                    ),
                  )
                }
              >
                <option value="">{t("laborEmployee")}…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              <Input
                aria-label={t("laborHours")}
                inputMode="decimal"
                placeholder={t("laborHours")}
                className="w-24"
                value={line.hours}
                onChange={(e) =>
                  setLaborLines((ls) =>
                    ls.map((l, i) =>
                      i === idx ? { ...l, hours: e.target.value } : l,
                    ),
                  )
                }
              />
              <Input
                aria-label={t("laborCostHour")}
                inputMode="decimal"
                placeholder={t("laborCostHour")}
                className="w-28"
                value={line.costHour}
                onChange={(e) =>
                  setLaborLines((ls) =>
                    ls.map((l, i) =>
                      i === idx ? { ...l, costHour: e.target.value } : l,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("removeLine")}
                onClick={() =>
                  setLaborLines((ls) => ls.filter((_, i) => i !== idx))
                }
              >
                ✕
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLaborLines((ls) => [
                  ...ls,
                  { employeeId: "", hours: "", costHour: "" },
                ])
              }
            >
              {t("addLaborLine")}
            </Button>
            {validLines.length > 0 && (
              <span className="text-sm text-muted-foreground" data-numeric="">
                {t("laborTotal")}: {laborTotal.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}

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
