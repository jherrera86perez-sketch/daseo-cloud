import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * StatCard portado del ERP CubaOne (`src/components/StatCard.tsx`).
 * La firma visual: etiqueta en `.t-eyebrow` (mono, 10px, versalitas muy
 * espaciadas), cifra en `.t-num-display` y pista debajo en gris atenuado.
 * El delta va en pastilla redondeada (radio 12px, padding 2px 8px) verde o
 * roja al 10 % de opacidad, como en el original.
 *
 * Server component.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; positive: boolean };
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border bg-card p-[18px]",
        "transition-colors duration-[220ms] hover:border-border-hover",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="t-eyebrow">{label}</span>
        {icon ? (
          <span className="shrink-0 text-text-muted" aria-hidden>
            {icon}
          </span>
        ) : null}
        {delta ? (
          <span
            className={cn(
              "rounded-xl px-2 py-0.5 text-xs font-medium",
              delta.positive
                ? "bg-[rgba(16,185,129,0.1)] text-[#10b981]"
                : "bg-[rgba(239,68,68,0.1)] text-[#ef4444]",
            )}
          >
            {delta.value}
          </span>
        ) : null}
      </div>

      <p className="t-num-display text-[22px] text-foreground" data-numeric>
        {value}
      </p>

      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
