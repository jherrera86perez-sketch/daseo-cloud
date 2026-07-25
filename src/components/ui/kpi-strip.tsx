import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { StatCard } from "./stat-card";

/*
 * KpiStrip portado del ERP CubaOne (`src/components/ui/KpiStrip.tsx`).
 * Rejilla de tarjetas KPI con gap de 8px, la misma que abre Control de Caja
 * (6 KPIs), Panel del Negocio (6) y Top Clientes (4).
 *
 * Server component.
 */
export function KpiStrip({
  items,
  className,
}: {
  items: Array<{
    label: string;
    value: string;
    hint?: string;
    delta?: { value: string; positive: boolean };
    icon?: ReactNode;
  }>;
  className?: string;
}) {
  return (
    <div
      data-slot="kpi-strip"
      className={cn(
        "grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {items.map((item) => (
        <StatCard key={item.label} {...item} />
      ))}
    </div>
  );
}
