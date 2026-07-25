"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { marcarSinDeudaAction } from "./actions";

/** "Sin deuda" del ERP: saca la compra de CxP sin registrar pago. */
export function SinDeudaButton({
  purchaseId,
  numero,
}: Readonly<{ purchaseId: string; numero: string }>) {
  const t = useTranslations("app.payables");
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-surface-hover disabled:opacity-50"
      onClick={() => {
        // confirm literal del ERP
        if (!window.confirm(t("sinDeudaConfirm", { numero }))) return;
        startTransition(async () => {
          const res = await marcarSinDeudaAction(purchaseId);
          if (res?.error) toast.error(res.error);
          else toast.success(t("sinDeudaOk"));
        });
      }}
    >
      {pending ? "…" : t("sinDeuda")}
    </button>
  );
}
