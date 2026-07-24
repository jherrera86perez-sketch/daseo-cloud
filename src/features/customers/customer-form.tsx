"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_TERMS, CUSTOMER_CATEGORIES } from "./schemas";
import { centsToDecimalString } from "@/lib/money";
import type { ActionState } from "./actions";
import type { CustomerRow } from "./queries";

export function CustomerForm({
  action,
  initial,
}: Readonly<{
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial?: Partial<CustomerRow>;
}>) {
  const t = useTranslations("app.customers.form");
  const [state, formAction, pending] = useActionState(action, null);
  const [customerType, setCustomerType] = useState(
    initial?.customerType ?? "CLIENTE",
  );
  const [blocked, setBlocked] = useState(initial?.blocked ?? false);

  const fields = [
    { name: "name", label: t("name"), required: true },
    { name: "taxId", label: t("taxId") },
    { name: "email", label: t("email"), type: "email" },
    { name: "phone", label: t("phone"), type: "tel" },
    { name: "address", label: t("address") },
  ] as const;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {/* ≈ compradores.tipo del ERP: CLIENTE/PDV — filtra CxC de verdad */}
      <div className="flex flex-col gap-2">
        <Label>{t("customerType")}</Label>
        <div className="flex rounded-md border p-0.5">
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 text-sm ${customerType === "CLIENTE" ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setCustomerType("CLIENTE")}
          >
            👤 {t("typeCliente")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 text-sm ${customerType === "PDV" ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setCustomerType("PDV")}
          >
            🏪 {t("typePdv")}
          </button>
        </div>
        <input type="hidden" name="customerType" value={customerType} />
        <p className="text-xs text-muted-foreground">{t("typeHint")}</p>
      </div>

      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-2">
          <Label htmlFor={f.name}>
            {f.label}
            {"required" in f && f.required ? " *" : ""}
          </Label>
          <Input
            id={f.name}
            name={f.name}
            type={"type" in f ? f.type : "text"}
            required={"required" in f && f.required}
            defaultValue={
              (initial?.[f.name as keyof CustomerRow] as string) ?? ""
            }
          />
        </div>
      ))}

      {/* Financiero (informativo, como el ERP: no se enforza en ventas) */}
      <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="paymentTerms">{t("paymentTerms")}</Label>
          <select
            id="paymentTerms"
            name="paymentTerms"
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            defaultValue={initial?.paymentTerms ?? ""}
          >
            <option value="">{t("paymentTermsNone")}</option>
            {PAYMENT_TERMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="creditDays">{t("creditDays")}</Label>
          <Input
            id="creditDays"
            name="creditDays"
            type="number"
            min={0}
            defaultValue={initial?.creditDays ?? ""}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="creditLimit">{t("creditLimit")}</Label>
          <Input
            id="creditLimit"
            name="creditLimit"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              initial?.creditLimitCents && initial.creditLimitCents > 0n
                ? centsToDecimalString(initial.creditLimitCents)
                : ""
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="discountDefaultPct">{t("discountDefault")}</Label>
          <Input
            id="discountDefaultPct"
            name="discountDefaultPct"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={initial?.discountDefaultPct ?? ""}
          />
        </div>
      </div>

      {/* Otros */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">{t("category")}</Label>
          <select
            id="category"
            name="category"
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            defaultValue={initial?.category ?? ""}
          >
            <option value="">{t("categoryNone")}</option>
            {CUSTOMER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="commercialType">{t("commercialType")}</Label>
          <Input
            id="commercialType"
            name="commercialType"
            placeholder={t("commercialTypePlaceholder")}
            defaultValue={initial?.commercialType ?? ""}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birthDate">{t("birthDate")}</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={initial?.birthDate ?? ""}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial ? Boolean(initial.active) : true}
          />
          {t("active")}
        </label>
        <label className="flex items-center gap-2 text-sm text-destructive">
          <input
            type="checkbox"
            name="blocked"
            checked={blocked}
            onChange={(e) => setBlocked(e.target.checked)}
          />
          {t("blocked")}
        </label>
        {blocked && (
          <Input
            name="blockReason"
            placeholder={t("blockReasonPlaceholder")}
            defaultValue={initial?.blockReason ?? ""}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Input id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
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
