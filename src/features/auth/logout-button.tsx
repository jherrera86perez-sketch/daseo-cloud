"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";

export function LogoutButton() {
  const t = useTranslations("auth");
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
    >
      <LogOut className="size-4" aria-hidden />
      {t("logout")}
    </button>
  );
}
