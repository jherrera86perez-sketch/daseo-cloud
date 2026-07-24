"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_UNITS } from "./schemas";
import { centsToDecimalString } from "@/lib/money";
import type { ActionState } from "./actions";
import type { ProductRow } from "./queries";

export function ProductForm({
  action,
  initial,
}: Readonly<{
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial?: Partial<ProductRow>;
}>) {
  const t = useTranslations("app.products.form");
  const [state, formAction, pending] = useActionState(action, null);

  const flags = [
    { name: "isSellable", label: t("isSellable"), def: true },
    { name: "isComponent", label: t("isComponent"), def: false },
    { name: "isProducible", label: t("isProducible"), def: false },
  ] as const;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")} *</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sku">{t("sku")}</Label>
          <Input id="sku" name="sku" defaultValue={initial?.sku ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="unit">{t("unit")}</Label>
          <select
            id="unit"
            name="unit"
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            defaultValue={initial?.unit ?? "unit"}
          >
            {PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(`units.${u}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">{t("price")}</Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              initial?.priceCents && initial.priceCents > 0n
                ? centsToDecimalString(initial.priceCents)
                : ""
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="stockMin">{t("stockMin")}</Label>
          <Input
            id="stockMin"
            name="stockMin"
            inputMode="decimal"
            defaultValue={initial?.stockMin ?? ""}
          />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        {flags.map((f) => (
          <label key={f.name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={f.name}
              defaultChecked={
                initial ? Boolean(initial[f.name as keyof ProductRow]) : f.def
              }
            />
            {f.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t("description")}</Label>
        <Input
          id="description"
          name="description"
          defaultValue={initial?.description ?? ""}
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
