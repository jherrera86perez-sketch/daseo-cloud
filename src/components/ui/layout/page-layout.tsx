import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * PageLayout portado del ERP CubaOne (`src/components/layout/PageLayout.tsx`).
 *
 * De sus 439 líneas se porta la REJILLA y el espaciado, no la maquinaria: la
 * mitad del original es lógica de la SPA (transiciones de ruta, breadcrumbs de
 * react-router, cálculo manual de alturas con calc()) que en Next resuelve el
 * framework.
 *
 * Reproduce la anatomía que confirmamos capturando las 7 pantallas de lista:
 *
 *   PageHeader   título + subtítulo + regla ámbar + acciones
 *   filters      búsqueda · selects · rango de fechas · DensityToggle
 *   ┌───────────────────────────────┬──────────────┐
 *   │ children                      │ aside ~280px │
 *   └───────────────────────────────┴──────────────┘
 *   footer       paginación
 *
 * `min-w-0` en ambas columnas es obligatorio: sin él una tabla ancha desborda
 * la rejilla y provoca scroll horizontal en toda la página.
 *
 * Server component.
 */
export function PageLayout({
  header,
  filters,
  aside,
  footer,
  children,
  className,
}: {
  header: ReactNode;
  filters?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // El padding lo pone el layout de (app); aquí sólo se centra y se acota.
        "mx-auto w-full max-w-[1600px]",
        className,
      )}
    >
      {header}

      {filters ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">{filters}</div>
      ) : null}

      {aside ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">{children}</div>
          <aside className="min-w-0 space-y-4">{aside}</aside>
        </div>
      ) : (
        <div className="min-w-0">{children}</div>
      )}

      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );
}
