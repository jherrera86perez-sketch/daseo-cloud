import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Tooltip portado del ERP CubaOne (`src/components/ui/feedback/Tooltip.tsx`).
 *
 * Posicionamiento con CSS puro (`group` + `group-hover`), sin librería: el ERP
 * tampoco usa una, y meter Floating UI cargaría peso en cada ruta para un
 * componente que sólo necesita colocarse encima o al lado.
 *
 * Server component — el hover es CSS, no estado. Lo usa la sidebar colapsada
 * (Tarea 9) para mostrar la etiqueta de cada icono.
 */
export function Tooltip({
  content,
  side = "right",
  children,
  className,
}: {
  content: string;
  side?: "top" | "right";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-[6px] border border-border bg-popover px-2 py-1",
          "t-label text-popover-foreground shadow-[var(--shadow-md)]",
          "group-hover/tooltip:block",
          side === "right"
            ? "top-1/2 left-[calc(100%+8px)] -translate-y-1/2"
            : "bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2",
        )}
      >
        {content}
      </span>
    </span>
  );
}
