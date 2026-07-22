"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { setBaseCurrency } from "@/features/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function OnboardingPage() {
  const t = useTranslations("auth.onboarding");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [slug, setSlug] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currency = String(form.get("currency"));
    setPending(true);
    const { data, error } = await authClient.organization.create({
      name: String(form.get("orgName")),
      slug: String(form.get("orgSlug")),
    });
    if (error || !data) {
      setPending(false);
      toast.error(error?.message ?? t("error"));
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    await setBaseCurrency(currency);
    setPending(false);
    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="orgName">{t("orgName")}</Label>
              <Input
                id="orgName"
                name="orgName"
                required
                onChange={(e) => setSlug(slugify(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="orgSlug">{t("orgSlug")}</Label>
              <Input
                id="orgSlug"
                name="orgSlug"
                required
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency">{t("currency")}</Label>
              <select
                id="currency"
                name="currency"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                defaultValue="CUP"
              >
                <option value="CUP">CUP</option>
                <option value="USD">USD</option>
                <option value="BRL">BRL</option>
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "…" : t("submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
