"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  sendQuoteAction,
  acceptQuoteAction,
  rejectQuoteAction,
  type ActionState,
} from "./actions";

export function QuoteActions({
  quoteId,
  status,
}: Readonly<{ quoteId: string; status: string }>) {
  const t = useTranslations("app.quotes");
  const [pending, start] = useTransition();

  function run(fn: (id: string) => Promise<ActionState>) {
    start(async () => {
      const res = await fn(quoteId);
      if (res?.error) toast.error(res.error);
    });
  }

  if (status === "accepted" || status === "rejected") {
    return null;
  }
  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(sendQuoteAction)}
        >
          {t("send")}
        </Button>
      )}
      <Button disabled={pending} onClick={() => run(acceptQuoteAction)}>
        {pending ? "…" : t("accept")}
      </Button>
      <Button
        variant="outline"
        className="text-destructive"
        disabled={pending}
        onClick={() => run(rejectQuoteAction)}
      >
        {t("reject")}
      </Button>
    </div>
  );
}
