"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteCustomerAction } from "./actions";

/** Borrado con confirmación explícita (acción destructiva). */
export function DeleteCustomerButton({ id }: Readonly<{ id: string }>) {
  const t = useTranslations("app.customers");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button
        variant="outline"
        className="max-w-lg text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" aria-hidden /> {t("delete")}
      </Button>
    );
  }
  return (
    <div className="flex max-w-lg items-center gap-2">
      <span className="text-sm">{t("deleteConfirm")}</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => deleteCustomerAction(id))}
      >
        {pending ? "…" : t("deleteYes")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
        {t("deleteNo")}
      </Button>
    </div>
  );
}
