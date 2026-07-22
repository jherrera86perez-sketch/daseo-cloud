"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  confirmPurchaseAction,
  cancelPurchaseAction,
  type ActionState,
} from "./actions";

export function PurchaseDetailActions({
  purchaseId,
  status,
}: Readonly<{ purchaseId: string; status: string }>) {
  const t = useTranslations("app.purchases");
  const [pending, start] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  function run(fn: (id: string) => Promise<ActionState>) {
    start(async () => {
      const res = await fn(purchaseId);
      if (res?.error) toast.error(res.error);
    });
  }

  if (status === "draft") {
    return (
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => run(confirmPurchaseAction)}>
          {pending ? "…" : t("confirm")}
        </Button>
        <Button
          variant="outline"
          className="text-destructive"
          disabled={pending}
          onClick={() => run(cancelPurchaseAction)}
        >
          {t("cancelDraft")}
        </Button>
      </div>
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
          {t("cancelPurchase")}
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
          onClick={() => run(cancelPurchaseAction)}
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
