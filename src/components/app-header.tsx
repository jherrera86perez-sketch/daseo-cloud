import { getTranslations } from "next-intl/server";
import { Bell, Coins } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { centsToDecimalString } from "@/lib/money";
import { CommandPaletteTrigger } from "./command-palette";
import type { NavItem } from "./command-palette";

/**
 * ≈ Header.tsx del ERP (campanita de stock bajo + "Te deben $X"), acotado a
 * lo que no está ya cubierto en otro lugar de Cloud: sin pastilla de fecha
 * de trabajo (Cloud usa fecha retroactiva por documento), sin widget de
 * tasas (ya vive en /settings), sin botón de backup (infra Electron/local,
 * no aplica a Neon), sin menú de usuario duplicado (logout ya está en el
 * sidebar).
 */
export async function AppHeader({
  lowStockCount,
  receivableCents,
  baseCurrency,
  navItems,
}: Readonly<{
  lowStockCount: number;
  receivableCents: bigint;
  baseCurrency: string;
  navItems: NavItem[];
}>) {
  const t = await getTranslations("app.header");

  return (
    <header className="flex h-12 items-center justify-between gap-3 border-b px-4">
      <CommandPaletteTrigger navItems={navItems} />
      <div className="flex items-center gap-3">
        {receivableCents > 0n && (
          <Link
            href="/receivables"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-amber-600 hover:bg-accent dark:text-amber-400"
            title={t("receivableTitle")}
          >
            <Coins className="size-4" aria-hidden />
            {t("receivable", {
              amount: centsToDecimalString(receivableCents),
              currency: baseCurrency,
            })}
          </Link>
        )}
        <Link
          href="/products"
          className="relative flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent"
          title={
            lowStockCount > 0
              ? t("lowStockTitle", { count: lowStockCount })
              : t("noAlerts")
          }
        >
          <Bell className="size-4" aria-hidden />
          {lowStockCount > 0 && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium text-destructive-foreground">
              {lowStockCount > 9 ? "9+" : lowStockCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
