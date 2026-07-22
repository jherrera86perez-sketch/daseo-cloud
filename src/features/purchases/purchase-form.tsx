"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPurchaseAction } from "./actions";

type SupplierOpt = { id: string; name: string };
type ProductOpt = { id: string; name: string };
type RateMap = Record<string, string>;

type Line = {
  productId?: string;
  description: string;
  qty: string;
  unitCost: string;
  lotCode: string;
  expiryDate: string;
};

const emptyLine = (): Line => ({
  description: "",
  qty: "1",
  unitCost: "",
  lotCode: "",
  expiryDate: "",
});

export function PurchaseForm({
  suppliers,
  products,
  rates,
  baseCurrency,
}: Readonly<{
  suppliers: SupplierOpt[];
  products: ProductOpt[];
  rates: RateMap;
  baseCurrency: string;
}>) {
  const t = useTranslations("app.purchases");
  const [state, formAction, pending] = useActionState(
    createPurchaseAction,
    null,
  );
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [currency, setCurrency] = useState(baseCurrency);
  const [rate, setRate] = useState("1");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce((acc, l) => {
    const q = parseFloat(l.qty.replace(",", ".")) || 0;
    const c = parseFloat(l.unitCost.replace(",", ".")) || 0;
    return acc + q * c;
  }, 0);

  const payload = JSON.stringify({
    supplierId,
    currency,
    rateToBase: rate,
    idempotencyKey,
    items: lines
      .filter((l) => l.description && l.qty && l.unitCost)
      .map((l) => ({
        productId: l.productId,
        description: l.description,
        qty: l.qty,
        unitCost: l.unitCost,
        lotCode: l.lotCode || undefined,
        expiryDate: l.expiryDate || undefined,
      })),
  });

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-supplier">{t("supplier")}</Label>
          <select
            id="p-supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            required
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-currency">{t("currency")}</Label>
          <select
            id="p-currency"
            value={currency}
            onChange={(e) => {
              const c = e.target.value;
              setCurrency(c);
              setRate(c === baseCurrency ? "1" : (rates[c] ?? ""));
            }}
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {["CUP", "USD", "BRL"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-rate">{t("rate", { base: baseCurrency })}</Label>
          <Input
            id="p-rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={currency === baseCurrency}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Label>{t("lines")}</Label>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t("product")}
                value={l.productId ?? ""}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setLine(i, {
                    productId: e.target.value || undefined,
                    description: p?.name ?? l.description,
                  });
                }}
                className="border-input h-9 w-44 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">{t("freeLine")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Input
                aria-label={t("description")}
                placeholder={t("description")}
                value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
                className="min-w-32 flex-1"
                required
              />
              <Input
                aria-label={t("qty")}
                placeholder={t("qty")}
                inputMode="decimal"
                value={l.qty}
                onChange={(e) => setLine(i, { qty: e.target.value })}
                className="w-20"
                required
              />
              <Input
                aria-label={t("unitCost")}
                placeholder={t("unitCost")}
                inputMode="decimal"
                value={l.unitCost}
                onChange={(e) => setLine(i, { unitCost: e.target.value })}
                className="w-24"
                required
              />
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeLine")}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden />
                </Button>
              )}
            </div>
            {l.productId && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Input
                  aria-label={t("lotCode")}
                  placeholder={t("lotCode")}
                  value={l.lotCode}
                  onChange={(e) => setLine(i, { lotCode: e.target.value })}
                  className="w-40"
                />
                <Input
                  aria-label={t("expiry")}
                  type="date"
                  value={l.expiryDate}
                  onChange={(e) => setLine(i, { expiryDate: e.target.value })}
                  className="w-40"
                  disabled={!l.lotCode}
                />
                <span className="text-xs text-muted-foreground">
                  {t("lotHint")}
                </span>
              </div>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setLines((ls) => [...ls, emptyLine()])}
        >
          <Plus className="size-4" aria-hidden /> {t("addLine")}
        </Button>
      </div>

      <p className="text-right text-lg font-bold" data-numeric="">
        {t("total")}: {total.toFixed(2)} {currency}
      </p>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending || !supplierId}>
        {pending ? "…" : t("saveDraft")}
      </Button>
    </form>
  );
}
