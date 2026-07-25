"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <select
      aria-label="Idioma / Língua"
      value={locale}
      onChange={(e) => router.replace(pathname, { locale: e.target.value })}
      className="h-8 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
    >
      <option value="es">Español</option>
      <option value="pt">Português</option>
    </select>
  );
}
