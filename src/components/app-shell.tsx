"use client";

import { useCallback, useState } from "react";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";

import { AppSidebar, type NavSection } from "./app-sidebar";

/*
 * Cáscara de la zona app: es la dueña del estado del cajón móvil.
 *
 * Existe porque `(app)/layout.tsx` es un Server Component y no puede sostener
 * `useState`. El layout le pasa la navegación como datos y el header y el pie
 * de la sidebar como elementos YA RENDERIZADOS — así `AppHeader` sigue siendo
 * un server component asíncrono aunque lo envuelva un cliente.
 *
 * El colapso de escritorio vive en AppSidebar (persistido en localStorage); el
 * cajón móvil vive aquí, porque el botón que lo abre está en el header.
 */
export function AppShell({
  sections,
  header,
  sidebarFooter,
  labels,
  children,
}: {
  sections: NavSection[];
  header: ReactNode;
  sidebarFooter?: ReactNode;
  labels: {
    openMenu: string;
    collapse: string;
    collapseSidebar: string;
    expandSidebar: string;
  };
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar
        sections={sections}
        footer={sidebarFooter}
        labels={labels}
        drawerOpen={drawerOpen}
        onCloseDrawer={closeDrawer}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-border bg-background">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={labels.openMenu}
            aria-expanded={drawerOpen}
            className="ml-2 rounded-[6px] p-2 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">{header}</div>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
