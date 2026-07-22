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
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  saveTelegramAction,
  sendSummaryNowAction,
  type ActionState,
} from "./actions";

export function ApiKeysCard({
  keys,
}: Readonly<{
  keys: Array<{ id: string; name: string; prefix: string }>;
}>) {
  const t = useTranslations("app.apiKeys");
  const ref = useRef<HTMLFormElement>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokePending, startRevoke] = useTransition();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await createApiKeyAction(prev, form);
      if (res?.plainKey) {
        ref.current?.reset();
        setNewKey(res.plainKey);
      }
      return res;
    },
    null,
  );
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <form ref={ref} action={formAction} className="flex items-center gap-2">
        <Input
          name="name"
          placeholder={t("namePlaceholder")}
          required
          className="w-56"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "…" : t("create")}
        </Button>
      </form>

      {newKey && (
        <div className="flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 p-2 text-sm">
          <code className="flex-1 overflow-x-auto whitespace-nowrap">
            {newKey}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(newKey);
              toast.success(t("copied"));
            }}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
          <span className="text-xs text-muted-foreground">{t("onceNote")}</span>
        </div>
      )}

      {keys.length > 0 && (
        <ul className="divide-y text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between py-2">
              <span>
                <span className="font-medium">{k.name}</span>{" "}
                <code className="text-xs text-muted-foreground">
                  {k.prefix}…
                </code>
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("revoke")}
                disabled={revokePending}
                onClick={() =>
                  startRevoke(async () => {
                    const res = await revokeApiKeyAction(k.id);
                    if (res?.error) toast.error(res.error);
                    else toast.success(t("revoked"));
                  })
                }
              >
                <Trash2 className="size-4 text-destructive" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("usage")}</p>
    </div>
  );
}

export function TelegramCard({
  initial,
}: Readonly<{ initial: { botToken: string; chatId: string } }>) {
  const t = useTranslations("app.telegram");
  const [sendPending, startSend] = useTransition();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await saveTelegramAction(prev, form);
      if (res?.ok) toast.success(t("saved"));
      return res;
    },
    null,
  );
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <Input
          name="botToken"
          placeholder={t("botToken")}
          defaultValue={initial.botToken}
          className="w-72"
          type="password"
        />
        <Input
          name="chatId"
          placeholder={t("chatId")}
          defaultValue={initial.chatId}
          className="w-40"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "…" : t("save")}
        </Button>
        <Button
          type="button"
          disabled={sendPending}
          onClick={() =>
            startSend(async () => {
              const res = await sendSummaryNowAction();
              if (res?.error) toast.error(res.error);
              else toast.success(t("sent"));
            })
          }
        >
          {sendPending ? "…" : t("sendNow")}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
