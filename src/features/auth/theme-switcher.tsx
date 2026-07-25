"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

const emptySubscribe = () => () => {};

export function ThemeSwitcher() {
  const t = useTranslations("app.theme");
  const { theme, setTheme } = useTheme();
  // El tema real solo se conoce en el cliente: evita el desajuste de hidratación.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <select
      aria-label={t("label")}
      value={mounted ? (theme ?? "system") : "system"}
      onChange={(e) => setTheme(e.target.value)}
      disabled={!mounted}
      className="h-8 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
    >
      <option value="light">{t("light")}</option>
      <option value="dark">{t("dark")}</option>
      <option value="system">{t("system")}</option>
    </select>
  );
}
