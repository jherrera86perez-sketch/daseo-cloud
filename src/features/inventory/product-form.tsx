"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_UNITS, PRODUCT_CATEGORIES } from "./schemas";
import { centsToDecimalString } from "@/lib/money";
import type { ActionState } from "./actions";
import type { ProductRow } from "./queries";

// Defaults de flags por categoría (ERP productos.js:90-95) — solo sugerencia
// inicial del formulario; el usuario los puede desmarcar libremente.
const CATEGORY_DEFAULTS: Record<
  string,
  { isSellable: boolean; isComponent: boolean; isProducible: boolean }
> = {
  insumo: { isSellable: false, isComponent: true, isProducible: false },
  semi_elaborado: { isSellable: false, isComponent: true, isProducible: true },
  producto_final: { isSellable: true, isComponent: false, isProducible: true },
  servicio: { isSellable: true, isComponent: false, isProducible: false },
};

export function ProductForm({
  action,
  initial,
}: Readonly<{
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial?: Partial<ProductRow>;
}>) {
  const t = useTranslations("app.products.form");
  const [state, formAction, pending] = useActionState(action, null);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [flags, setFlags] = useState({
    isSellable: initial ? Boolean(initial.isSellable) : true,
    isComponent: initial ? Boolean(initial.isComponent) : false,
    isProducible: initial ? Boolean(initial.isProducible) : false,
  });
  const [stockMinMode, setStockMinMode] = useState(
    initial?.stockMinMode ?? "manual",
  );

  const barcodeRequired = category !== "" && category !== "servicio";

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
          <Label htmlFor="category">{t("category")}</Label>
          <select
            id="category"
            name="category"
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            value={category}
            onChange={(e) => {
              const c = e.target.value;
              setCategory(c);
              if (c && CATEGORY_DEFAULTS[c]) setFlags(CATEGORY_DEFAULTS[c]);
            }}
          >
            <option value="">{t("categoryNone")}</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
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
          <Label htmlFor="sku">{t("sku")}</Label>
          <Input id="sku" name="sku" defaultValue={initial?.sku ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="barcode">
            {t("barcode")}
            {barcodeRequired ? " *" : ""}
          </Label>
          <Input
            id="barcode"
            name="barcode"
            required={barcodeRequired}
            placeholder={t("barcodePlaceholder")}
            defaultValue={initial?.barcode ?? ""}
          />
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
            disabled={stockMinMode === "auto"}
            defaultValue={initial?.stockMin ?? ""}
          />
        </div>
      </div>

      {/* Stock mínimo automático (ROP) — paridad ERP */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stockMinMode === "auto"}
            onChange={(e) =>
              setStockMinMode(e.target.checked ? "auto" : "manual")
            }
          />
          {t("autoStockMin")}
        </label>
        <input type="hidden" name="stockMinMode" value={stockMinMode} />
        {stockMinMode === "auto" && (
          <>
            <p className="text-xs text-muted-foreground">{t("autoHint")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="leadDays" className="text-xs">
                  {t("leadDays")}
                </Label>
                <Input
                  id="leadDays"
                  name="leadDays"
                  type="number"
                  min={0}
                  defaultValue={initial?.leadDays ?? 7}
                  className="h-8"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="safetyDays" className="text-xs">
                  {t("safetyDays")}
                </Label>
                <Input
                  id="safetyDays"
                  name="safetyDays"
                  type="number"
                  min={0}
                  defaultValue={initial?.safetyDays ?? 3}
                  className="h-8"
                />
              </div>
            </div>
            {initial?.stockMinCalculated && (
              <p className="text-xs text-muted-foreground" data-numeric="">
                {t("lastCalculated", {
                  value: initial.stockMinCalculated,
                })}
              </p>
            )}
          </>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isSellable"
            checked={flags.isSellable}
            onChange={(e) =>
              setFlags((f) => ({ ...f, isSellable: e.target.checked }))
            }
          />
          {t("isSellable")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isComponent"
            checked={flags.isComponent}
            onChange={(e) =>
              setFlags((f) => ({ ...f, isComponent: e.target.checked }))
            }
          />
          {t("isComponent")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isProducible"
            checked={flags.isProducible}
            onChange={(e) =>
              setFlags((f) => ({ ...f, isProducible: e.target.checked }))
            }
          />
          {t("isProducible")}
        </label>
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
