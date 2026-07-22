"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSaleAction } from "./actions";

type ProductOpt = {
  id: string;
  name: string;
  price: string; // decimal en moneda base (referencial)
};
type CustomerOpt = { id: string; name: string };
type RateMap = Record<string, string>;

type Line = {
  productId?: string;
  description: string;
  qty: string;
  unitPrice: string;
};

export function SaleForm({
  customers,
  products,
  rates,
  baseCurrency,
}: Readonly<{
  customers: CustomerOpt[];
  products: ProductOpt[];
  rates: RateMap;
  baseCurrency: string;
}>) {
  const t = useTranslations("app.sales");
  const [state, formAction, pending] = useActionState(createSaleAction, null);
  const [currency, setCurrency] = useState(baseCurrency);
  const [rate, setRate] = useState("1");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([
    { description: "", qty: "1", unitPrice: "" },
  ]);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function onProductPick(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    setLine(i, {
      productId: productId || undefined,
      description: p?.name ?? lines[i].description,
      unitPrice: p && currency === baseCurrency ? p.price : lines[i].unitPrice,
    });
  }

  function onCurrencyChange(c: string) {
    setCurrency(c);
    setRate(c === baseCurrency ? "1" : (rates[c] ?? ""));
  }

  const total = lines.reduce((acc, l) => {
    const q = parseFloat(l.qty.replace(",", ".")) || 0;
    const p = parseFloat(l.unitPrice.replace(",", ".")) || 0;
    return acc + q * p;
  }, 0);

  const payload = JSON.stringify({
    customerId,
    currency,
    rateToBase: rate,
    idempotencyKey,
    items: lines.filter((l) => l.description && l.qty && l.unitPrice),
  });

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="customer">{t("customer")}</Label>
          <select
            id="customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            required
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currency">{t("currency")}</Label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {["CUP", "USD", "BRL"].map((c) => (
              <option key={c} value={c}>
                {c}
                {c === baseCurrency ? ` (${t("base")})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rate">{t("rate", { base: baseCurrency })}</Label>
          <Input
            id="rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={currency === baseCurrency}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("lines")}</Label>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t("product")}
              value={l.productId ?? ""}
              onChange={(e) => onProductPick(i, e.target.value)}
              className="border-input h-9 w-40 rounded-md border bg-transparent px-2 text-sm"
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
              aria-label={t("unitPrice")}
              placeholder={t("unitPrice")}
              inputMode="decimal"
              value={l.unitPrice}
              onChange={(e) => setLine(i, { unitPrice: e.target.value })}
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
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setLines((ls) => [
              ...ls,
              { description: "", qty: "1", unitPrice: "" },
            ])
          }
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
      <Button type="submit" disabled={pending || !customerId}>
        {pending ? "…" : t("saveDraft")}
      </Button>
    </form>
  );
}
