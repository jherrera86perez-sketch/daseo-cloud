"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useRouter, Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function InvitePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const t = useTranslations("auth.invite");
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [accepting, setAccepting] = useState(false);

  async function accept() {
    setAccepting(true);
    const { data, error } = await authClient.organization.acceptInvitation({
      invitationId: id,
    });
    if (error || !data) {
      setAccepting(false);
      toast.error(error?.message ?? t("error"));
      return;
    }
    await authClient.organization.setActive({
      organizationId: data.invitation.organizationId,
    });
    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isPending ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : session ? (
            <Button onClick={accept} disabled={accepting}>
              {accepting ? "…" : t("accept")}
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("needLogin")}</p>
              <Button asChild>
                <Link href="/signup">{t("goSignup")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login">{t("goLogin")}</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
