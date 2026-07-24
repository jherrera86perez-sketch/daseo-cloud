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
  // Paridad ERP: Contado/Crédito, fecha retroactiva, factura, gastos, notas
  const [payType, setPayType] = useState<"cash" | "credit">("cash");
  const [terms, setTerms] = useState("30 días");
  const [receivedAt, setReceivedAt] = useState("");
  const [supplierInvoice, setSupplierInvoice] = useState("");
  const [transport, setTransport] = useState("");
  const [allowance, setAllowance] = useState("");
  const [otherCosts, setOtherCosts] = useState("");
  const [note, setNote] = useState("");
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const hoyStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const subtotal = lines.reduce((acc, l) => {
    const q = parseFloat(l.qty.replace(",", ".")) || 0;
    const c = parseFloat(l.unitCost.replace(",", ".")) || 0;
    return acc + q * c;
  }, 0);
  const gastos =
    (parseFloat(transport.replace(",", ".")) || 0) +
    (parseFloat(allowance.replace(",", ".")) || 0) +
    (parseFloat(otherCosts.replace(",", ".")) || 0);
  const total = subtotal + gastos;

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
    transport,
    allowance,
    otherCosts,
    paymentTerms: payType === "credit" ? terms : undefined,
    supplierInvoice,
    note,
    receivedAt,
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

      {/* Tipo de pago + fecha + factura (paridad ERP) */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label>{t("payType")}</Label>
          <div className="flex rounded-md border p-0.5">
            <button
              type="button"
              className={`flex-1 rounded px-2 py-1 text-sm ${payType === "cash" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setPayType("cash")}
            >
              💵 {t("cashType")}
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-2 py-1 text-sm ${payType === "credit" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setPayType("credit")}
            >
              📋 {t("creditType")}
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {payType === "cash" ? t("cashHint") : t("creditHint")}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-date">{t("purchaseDate")}</Label>
          <Input
            id="p-date"
            type="date"
            max={hoyStr}
            value={receivedAt || hoyStr}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
          {receivedAt && receivedAt !== hoyStr && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("backdated")}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-inv">{t("supplierInvoice")}</Label>
          <Input
            id="p-inv"
            placeholder={t("supplierInvoicePlaceholder")}
            value={supplierInvoice}
            onChange={(e) => setSupplierInvoice(e.target.value)}
          />
        </div>
        {payType === "credit" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-terms">{t("terms")}</Label>
            <select
              id="p-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              {["15 días", "30 días", "60 días", "90 días"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Gastos adicionales (se prorratean al costo en la recepción) */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-transport">{t("transport")}</Label>
          <Input
            id="p-transport"
            inputMode="decimal"
            placeholder="0.00"
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-allowance">{t("allowance")}</Label>
          <Input
            id="p-allowance"
            inputMode="decimal"
            placeholder="0.00"
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-other">{t("otherCosts")}</Label>
          <Input
            id="p-other"
            inputMode="decimal"
            placeholder="0.00"
            value={otherCosts}
            onChange={(e) => setOtherCosts(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-note">{t("notes")}</Label>
          <Input
            id="p-note"
            placeholder={t("notesPlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="text-right" data-numeric="">
        {gastos > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("subtotalLabel")}: {subtotal.toFixed(2)} · {t("expenses")}:{" "}
            {gastos.toFixed(2)}
          </p>
        )}
        <p className="text-lg font-bold">
          {t("total")}: {total.toFixed(2)} {currency}
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="mode"
          value="draft"
          variant="outline"
          disabled={pending || !supplierId}
        >
          {pending ? "…" : `💾 ${t("saveDraft")}`}
        </Button>
        <Button
          type="submit"
          name="mode"
          value={payType}
          disabled={pending || !supplierId}
        >
          {pending ? "…" : t("confirmPurchase")}
        </Button>
      </div>
    </form>
  );
}
