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
      className="border-input mx-3 mb-3 h-8 rounded-md border bg-transparent px-2 text-xs"
    >
      <option value="es">Español</option>
      <option value="pt">Português</option>
    </select>
  );
}
