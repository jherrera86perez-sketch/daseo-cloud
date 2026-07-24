"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSaleAction, type ActionState } from "./actions";
import { PAYMENT_METHODS, type PaymentMethod } from "./constants";

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

type PayLine = { method: PaymentMethod; amount: string };

export function SaleForm({
  customers,
  products,
  rates,
  baseCurrency,
  action = createSaleAction,
  submitLabel,
  dealId,
  saleExtras = false,
  taxPct = "0",
}: Readonly<{
  customers: CustomerOpt[];
  products: ProductOpt[];
  rates: RateMap;
  baseCurrency: string;
  action?: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel?: string;
  dealId?: string;
  /** Paridad ERP: contado/crédito, fecha, descuento, OC, pagos múltiples */
  saleExtras?: boolean;
  /** IVA global (config.impuesto del ERP), % desde la config de la org */
  taxPct?: string;
}>) {
  const t = useTranslations("app.sales");
  const [state, formAction, pending] = useActionState(action, null);
  const [currency, setCurrency] = useState(baseCurrency);
  const [rate, setRate] = useState("1");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([
    { description: "", qty: "1", unitPrice: "" },
  ]);
  // Extras ERP
  const [saleType, setSaleType] = useState<"cash" | "credit">("cash");
  const [soldAt, setSoldAt] = useState("");
  const [discount, setDiscount] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [note, setNote] = useState("");
  const [payLines, setPayLines] = useState<PayLine[]>([
    { method: "cash", amount: "" },
  ]);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const hoyStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

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

  const subtotal = lines.reduce((acc, l) => {
    const q = parseFloat(l.qty.replace(",", ".")) || 0;
    const p = parseFloat(l.unitPrice.replace(",", ".")) || 0;
    return acc + q * p;
  }, 0);
  // ERP: total = max(0, subtotal + IVA(config %) − descuento)
  const ivaPct = saleExtras ? parseFloat(taxPct.replace(",", ".")) || 0 : 0;
  const iva = Math.round(subtotal * ivaPct) / 100;
  const desc = saleExtras ? parseFloat(discount.replace(",", ".")) || 0 : 0;
  const total = Math.max(0, subtotal + iva - desc);

  const pagado = payLines.reduce(
    (s, p) => s + (parseFloat(p.amount.replace(",", ".")) || 0),
    0,
  );
  const conPagos = payLines.some((p) => p.amount);
  const diff = Math.round((total - pagado) * 100) / 100;

  const payload = JSON.stringify({
    customerId,
    currency,
    rateToBase: rate,
    idempotencyKey,
    dealId,
    items: lines.filter((l) => l.description && l.qty && l.unitPrice),
    ...(saleExtras
      ? {
          discount,
          soldAt,
          poNumber,
          note,
          payments: saleType === "cash" ? payLines.filter((p) => p.amount) : [],
        }
      : {}),
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

      {saleExtras && (
        <>
          {/* Tipo de venta + fecha + descuento + OC (paridad ERP) */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label>{t("saleType")}</Label>
              <div className="flex rounded-md border p-0.5">
                <button
                  type="button"
                  className={`flex-1 rounded px-2 py-1 text-sm ${saleType === "cash" ? "bg-primary text-primary-foreground" : ""}`}
                  onClick={() => setSaleType("cash")}
                >
                  {t("cashSale")}
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded px-2 py-1 text-sm ${saleType === "credit" ? "bg-primary text-primary-foreground" : ""}`}
                  onClick={() => setSaleType("credit")}
                >
                  {t("creditSale")}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="soldAt">{t("saleDate")}</Label>
              <Input
                id="soldAt"
                type="date"
                max={hoyStr}
                value={soldAt || hoyStr}
                onChange={(e) => setSoldAt(e.target.value)}
              />
              {soldAt && soldAt !== hoyStr && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {t("backdated")}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discount">{t("discount")}</Label>
              <Input
                id="discount"
                inputMode="decimal"
                placeholder="0.00"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="po">{t("poNumber")}</Label>
              <Input
                id="po"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Pagos múltiples, solo Contado (>1 método = MIXTO del ERP) */}
          {saleType === "cash" && (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <Label>{t("payments")}</Label>
              {payLines.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={t("payMethod")}
                    value={p.method}
                    onChange={(e) =>
                      setPayLines((ps) =>
                        ps.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                method: e.target.value as PayLine["method"],
                              }
                            : x,
                        ),
                      )
                    }
                    className="border-input h-9 w-40 rounded-md border bg-transparent px-2 text-sm"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`methods.${m}`)}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={t("payAmount")}
                    inputMode="decimal"
                    placeholder={t("payAmount")}
                    value={p.amount}
                    onChange={(e) =>
                      setPayLines((ps) =>
                        ps.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value } : x,
                        ),
                      )
                    }
                    className="w-28"
                  />
                  {payLines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeLine")}
                      onClick={() =>
                        setPayLines((ps) => ps.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPayLines((ps) => [...ps, { method: "cash", amount: "" }])
                  }
                >
                  <Plus className="size-4" aria-hidden /> {t("addPayment")}
                </Button>
                {payLines.filter((p) => p.amount).length > 1 && (
                  <span className="text-muted-foreground">· MIXTO</span>
                )}
                {conPagos && (
                  <span data-numeric="">
                    {t("paidIndicator", {
                      paid: pagado.toFixed(2),
                      total: total.toFixed(2),
                    })}{" "}
                    {diff === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✅ {t("covered")}
                      </span>
                    ) : diff > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⚠️ {t("missing", { amount: diff.toFixed(2) })}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⚠️ {t("exceeds", { amount: Math.abs(diff).toFixed(2) })}
                      </span>
                    )}
                  </span>
                )}
                {!conPagos && (
                  <span className="text-xs text-muted-foreground">
                    {t("autoFillHint")}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="note">{t("notes")}</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="text-right" data-numeric="">
        {saleExtras && (ivaPct > 0 || desc > 0) && (
          <p className="text-sm text-muted-foreground">
            {t("subtotal")}: {subtotal.toFixed(2)}
            {ivaPct > 0 && (
              <>
                {" "}
                · IVA ({ivaPct}%): {iva.toFixed(2)}
              </>
            )}
            {desc > 0 && (
              <>
                {" "}
                · {t("discount")}: −{desc.toFixed(2)}
              </>
            )}
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
      {saleExtras ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            name="mode"
            value="draft"
            variant="outline"
            disabled={pending || !customerId}
          >
            {pending ? "…" : `💾 ${t("saveDraft")}`}
          </Button>
          <Button
            type="submit"
            name="mode"
            value={saleType}
            disabled={pending || !customerId}
          >
            {pending
              ? "…"
              : saleType === "cash"
                ? t("chargeNow")
                : t("saveCredit")}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={pending || !customerId}>
          {pending ? "…" : (submitLabel ?? t("saveDraft"))}
        </Button>
      )}
    </form>
  );
}
