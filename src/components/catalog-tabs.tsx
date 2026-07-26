import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/*
 * ≈ "Catálogos Maestros" del ERP: un módulo con pestañas para clientes,
 * proveedores, productos y recetas, en vez de cuatro entradas sueltas en el
 * menú (el ERP no tiene ninguna de las cuatro como item propio).
 *
 * Las pestañas enlazan a las páginas que ya existen en lugar de embeberlas:
 * cada una tiene sus propios filtros y su panel lateral, y fundirlas perdería
 * funcionalidad. Así se gana la agrupación del ERP sin sacrificar nada.
 *
 * Server component.
 */
const TABS = [
  { id: "customers", href: "/customers" },
  { id: "suppliers", href: "/suppliers" },
  { id: "products", href: "/products" },
  { id: "recipes", href: "/recipes" },
] as const;

export async function CatalogTabs({
  active,
}: {
  active: (typeof TABS)[number]["id"];
}) {
  const t = await getTranslations("app.nav");

  return (
    <nav
      aria-label="Catálogos"
      className="mb-4 flex flex-wrap items-center gap-1 border-b border-border"
    >
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative -mb-px px-3 py-2 text-sm transition-colors",
              on
                ? "border-b-2 border-brand-accent font-medium text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.id)}
          </Link>
        );
      })}
    </nav>
  );
}
