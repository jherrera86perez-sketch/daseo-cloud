import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * SectionHeader portado del ERP CubaOne (`src/components/ui/atoms/`).
 * Cabecera de sección dentro de una página: eyebrow opcional en mono,
 * título en font-display y acción a la derecha.
 *
 * Server component.
 */
export function SectionHeader({
  eyebrow,
  title,
  hint,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-3 flex items-end justify-between gap-3", className)}
      data-slot="section-header"
    >
      <div>
        {eyebrow ? <p className="t-eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="t-display text-lg">{title}</h2>
        {hint ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
