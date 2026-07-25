"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Droplets, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/feedback/tooltip";

/*
 * Sidebar portada del ERP CubaOne (`src/components/Sidebar.tsx`, 725 líneas).
 *
 * Antes vivía incrustada en `(app)/layout.tsx`, que además hace `requireOrg`,
 * el gate de suscripción y el header. Extraerla era condición previa: no se
 * clonan 725 líneas dentro de un layout que hace otras tres cosas.
 *
 * Piel Linear del ERP: fondo claro `--sidebar` (#F4F4F5), NO la navy oscura
 * del `tailwind.config.js`, que es la piel editorial legacy. Item activo con
 * fondo `--sidebar-active-bg` y borde izquierdo navy de 2px.
 *
 * Se porta el colapsar/expandir con persistencia y tooltips, que en la paridad
 * del chrome del 24-jul se había descartado por "cosmético". Bajo "clon
 * pantalla por pantalla" esa decisión queda revertida.
 *
 * Los iconos llegan ya renderizados como ReactNode. Pasar el componente de
 * lucide como prop desde el layout (Server) hasta aquí (Client) rompe la app
 * entera en runtime: "Functions cannot be passed directly to Client
 * Components". Fue el fallo que tumbó 28 de 32 E2E el 24-jul.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

export type NavSection = { title: string; items: NavItem[] };

const STORAGE_KEY = "sidebarCollapsed";
const EVENT = "daseo:sidebar-collapsed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/*
 * `localStorage` como external store: el lint de React 19 prohíbe setState en
 * effect, y así el servidor renderiza siempre expandida y el cliente
 * sincroniza sin desajuste de hidratación.
 */
function getCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppSidebar({
  sections,
  footer,
  labels,
  drawerOpen,
  onCloseDrawer,
}: {
  sections: NavSection[];
  footer?: ReactNode;
  labels: { collapse: string; collapseSidebar: string; expandSidebar: string };
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, () => false);

  const toggleCollapsed = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(!getCollapsed()));
    } catch {
      /* modo privado: el colapso simplemente no persiste */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  // El cajón se cierra al navegar.
  useEffect(() => {
    onCloseDrawer();
  }, [pathname, onCloseDrawer]);

  return (
    <>
      {/* Backdrop del cajón móvil */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onCloseDrawer}
          aria-hidden
        />
      ) : null}

      <aside
        data-collapsed={collapsed}
        className={cn(
          "z-40 flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "transition-[width] duration-200",
          // Escritorio: fijo en el flujo, ancho según colapso
          "lg:sticky lg:top-0 lg:h-dvh",
          collapsed ? "lg:w-[64px]" : "lg:w-[228px]",
          // Móvil: cajón fuera del flujo
          "fixed inset-y-0 left-0 w-[260px] lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          "transition-transform lg:transition-[width]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <Droplets className="size-5 shrink-0 text-primary" aria-hidden />
          {!collapsed ? (
            <span className="t-display truncate text-[15px]">Daseo Cloud</span>
          ) : null}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              {!collapsed ? (
                <p className="t-label px-3 pt-3 pb-1 text-sidebar-section-label">
                  {section.title}
                </p>
              ) : (
                <div
                  className="mx-3 my-2 h-px bg-sidebar-divider"
                  aria-hidden
                />
              )}

              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-[6px] py-2 text-sm transition-colors duration-150",
                      collapsed ? "justify-center px-2" : "px-3",
                      active
                        ? "bg-sidebar-active-bg font-medium text-sidebar-text-active"
                        : "text-sidebar-text-inactive hover:bg-sidebar-hover-bg hover:text-sidebar-text-active",
                    )}
                  >
                    {/* Borde izquierdo navy del item activo */}
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-sidebar-active-border"
                      />
                    ) : null}

                    <span className="shrink-0">{item.icon}</span>

                    {!collapsed ? (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto shrink-0 rounded-full bg-brand-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-accent">
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    ) : null}

                    {/* Colapsada, el contador va sobre el icono */}
                    {collapsed && item.badge ? (
                      <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-brand-accent" />
                    ) : null}
                  </Link>
                );

                return collapsed ? (
                  <Tooltip
                    key={item.href}
                    content={item.label}
                    className="w-full"
                  >
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-divider p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={
              collapsed ? labels.expandSidebar : labels.collapseSidebar
            }
            className={cn(
              "hidden w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-sm lg:flex",
              "text-sidebar-text-inactive transition-colors hover:bg-sidebar-hover-bg hover:text-sidebar-text-active",
              collapsed && "justify-center px-2",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="size-4 shrink-0" aria-hidden />
                <span>{labels.collapse}</span>
              </>
            )}
          </button>

          {!collapsed ? footer : null}
        </div>
      </aside>
    </>
  );
}
