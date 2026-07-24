"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmSaleAction,
  cancelSaleAction,
  addPaymentAction,
  type ActionState,
} from "./actions";

export function ConfirmCancelButtons({
  saleId,
  status,
}: Readonly<{ saleId: string; status: string }>) {
  const t = useTranslations("app.sales");
  const [pending, start] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function run(fn: (id: string) => Promise<ActionState>) {
    start(async () => {
      const res = await fn(saleId);
      if (res?.error) toast.error(res.error);
    });
  }

  if (status === "draft") {
    return (
      <Button disabled={pending} onClick={() => run(confirmSaleAction)}>
        {pending ? "…" : t("confirm")}
      </Button>
    );
  }
  if (status === "confirmed") {
    if (!confirmingCancel) {
      return (
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => setConfirmingCancel(true)}
        >
          {t("cancelSale")}
        </Button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">{t("cancelConfirm")}</span>
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => run(cancelSaleAction)}
        >
          {pending ? "…" : t("cancelYes")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmingCancel(false)}
        >
          {t("cancelNo")}
        </Button>
      </div>
    );
  }
  return null;
}

export function PaymentForm({
  saleId,
  saleCurrency,
  action,
  balance,
}: Readonly<{
  saleId: string;
  saleCurrency: string;
  // pre-enlazada al documento; por defecto, cobro de venta
  action?: (prev: ActionState, form: FormData) => Promise<ActionState>;
  /** saldo pendiente (decimal) — habilita "Cobrar saldo completo" del ERP */
  balance?: string;
}>) {
  const t = useTranslations("app.sales");
  const ref = useRef<HTMLFormElement>(null);
  const [currency, setCurrency] = useState(saleCurrency);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const boundAction = action ?? addPaymentAction.bind(null, saleId);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      // misma moneda: applied = amount (el usuario no repite el dato)
      if (String(form.get("currency")) === saleCurrency) {
        form.set("applied", String(form.get("amount")));
        form.set("rate", "1");
      }
      const res = await boundAction(prev, form);
      if (!res?.error) {
        ref.current?.reset();
        setCurrency(saleCurrency);
        setAmount("");
        setMethod("cash");
        toast.success(t("paymentSaved"));
      }
      return res;
    },
    null,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  const cross = currency !== saleCurrency;

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      {/* Atajos del ERP: "Cobrar saldo completo" en efectivo o transferencia */}
      {balance && (
        <div className="flex w-full gap-2 text-xs">
          <button
            type="button"
            className="rounded-md border px-2 py-1 hover:bg-accent"
            onClick={() => {
              setAmount(balance);
              setMethod("cash");
              setCurrency(saleCurrency);
            }}
          >
            💵 {t("chargeFullBalance")}
          </button>
          <button
            type="button"
            className="rounded-md border px-2 py-1 hover:bg-accent"
            onClick={() => {
              setAmount(balance);
              setMethod("transfer");
              setCurrency(saleCurrency);
            }}
          >
            🏦 {t("chargeFullBalanceTransfer")}
          </button>
        </div>
      )}
      <Input
        name="amount"
        inputMode="decimal"
        placeholder={t("amount")}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        className="w-28"
      />
      <select
        name="currency"
        aria-label={t("currency")}
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
      >
        {["CUP", "USD", "BRL"].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {cross && (
        <>
          <Input
            name="rate"
            inputMode="decimal"
            placeholder={t("paymentRate")}
            required
            className="w-24"
          />
          <Input
            name="applied"
            inputMode="decimal"
            placeholder={t("applied", { currency: saleCurrency })}
            required
            className="w-32"
          />
        </>
      )}
      <select
        name="method"
        aria-label={t("payMethod")}
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        {["cash", "card", "transfer", "qr", "mlc", "usd", "other"].map((m) => (
          <option key={m} value={m}>
            {t(`methods.${m}`)}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "…" : t("registerPayment")}
      </Button>
    </form>
  );
}
