"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteForm() {
  const t = useTranslations("app.members");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const { data, error } = await authClient.organization.inviteMember({
      email: String(form.get("email")),
      role: String(form.get("role")) === "admin" ? "admin" : "member",
    });
    setPending(false);
    if (error || !data) {
      toast.error(error?.message ?? t("inviteError"));
      return;
    }
    const prefix = locale === "es" ? "" : `/${locale}`;
    setLink(`${window.location.origin}${prefix}/invite/${data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="invite-email">{t("inviteEmail")}</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">{t("inviteRole")}</Label>
          <select
            id="invite-role"
            name="role"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
            defaultValue="member"
          >
            <option value="member">{t("roleMember")}</option>
            <option value="admin">{t("roleAdmin")}</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "…" : t("inviteSubmit")}
        </Button>
      </div>
      {link && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm">
          <code className="flex-1 overflow-x-auto whitespace-nowrap">
            {link}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast.success(t("linkCopied"));
            }}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
        </div>
      )}
    </form>
  );
}
