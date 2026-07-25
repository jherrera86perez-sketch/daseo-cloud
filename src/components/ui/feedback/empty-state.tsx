import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * EmptyState portado del ERP CubaOne
 * (`src/components/ui/feedback/EmptyState.tsx`). Es el "Sin compromisos" de
 * Compromisos y el "Cuentas saneadas" de CxP: icono grande atenuado, título en
 * font-display y mensaje en gris.
 *
 * Server component.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="text-text-muted [&_svg]:size-8" aria-hidden>
          {icon}
        </span>
      ) : null}
      <p className="t-display text-base">{title}</p>
      {message ? (
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
