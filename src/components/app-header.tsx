import { getTranslations } from "next-intl/server";
import { Bell, Coins } from "lucide-react";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { centsToDecimalString } from "@/lib/money";
import { CommandPaletteTrigger } from "./command-palette";
import { ExchangeRates } from "./exchange-rates";
import { UserMenu } from "./user-menu";
import type { NavItem } from "./command-palette";

/**
 * Header portado del ERP CubaOne (`src/components/Header.tsx`, 358 líneas).
 *
 * Entran sus elementos con valor real: campanita de stock bajo, indicador
 * "Te deben $X", widget de tasas y menú de usuario con avatar — estos dos
 * últimos vivían dispersos en /settings y en el pie de la sidebar.
 *
 * NO entran (fuera de alcance del spec): la pastilla de "fecha de trabajo"
 * —paradigma offline de escritorio; Cloud ya tiene fecha retroactiva POR
 * documento, que es más granular— ni el botón de respaldo a carpeta, que es
 * infraestructura Electron y no aplica sobre Neon.
 */
export async function AppHeader({
  lowStockCount,
  receivableCents,
  baseCurrency,
  navItems,
  rates,
  userName,
  userRole,
  userMenu,
}: Readonly<{
  lowStockCount: number;
  receivableCents: bigint;
  baseCurrency: string;
  navItems: NavItem[];
  rates: Array<{ currency: string; value: string }>;
  userName: string;
  userRole: string;
  userMenu: ReactNode;
}>) {
  const t = await getTranslations("app.header");

  return (
    <header className="flex h-14 items-center justify-between gap-3 px-4">
      <CommandPaletteTrigger navItems={navItems} />

      <div className="flex items-center gap-2">
        <ExchangeRates rates={rates} />

        {receivableCents > 0n && (
          <Link
            href="/receivables"
            className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-sm text-brand-accent transition-colors hover:bg-surface-100"
            title={t("receivableTitle")}
          >
            <Coins className="size-4" aria-hidden />
            <span className="t-num">
              {t("receivable", {
                amount: centsToDecimalString(receivableCents),
                currency: baseCurrency,
              })}
            </span>
          </Link>
        )}

        <Link
          href="/products"
          className="relative flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
          title={
            lowStockCount > 0
              ? t("lowStockTitle", { count: lowStockCount })
              : t("noAlerts")
          }
        >
          <Bell className="size-4" aria-hidden />
          {lowStockCount > 0 && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium text-white">
              {lowStockCount > 9 ? "9+" : lowStockCount}
            </span>
          )}
        </Link>

        <UserMenu name={userName} role={userRole} label={t("userMenu")}>
          {userMenu}
        </UserMenu>
      </div>
    </header>
  );
}
