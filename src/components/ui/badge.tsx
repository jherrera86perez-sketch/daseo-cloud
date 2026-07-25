import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Badge portado del ERP CubaOne (`src/components/Badge.tsx`).
 * Los pares fondo/texto salen de sus escalas 50/800 (index.css:363-415) y
 * están todos por encima de 7:1, así que no comprometen el gate de
 * accesibilidad. En oscuro se invierten a 900/300.
 *
 * Server component.
 */
const TONES = {
  neutral: "bg-surface-100 text-foreground dark:bg-surface-200",
  primary: "bg-[var(--primary-muted)] text-primary",
  success: "bg-[#DCFCE7] text-[#14532D] dark:bg-[#052E16] dark:text-[#4ADE80]",
  warning: "bg-[#FEF3C7] text-[#78350F] dark:bg-[#451A03] dark:text-[#FCD34D]",
  danger: "bg-[#FEE2E2] text-[#7F1D1D] dark:bg-[#450A0A] dark:text-[#F87171]",
  info: "bg-[#DBEAFE] text-[#1E3A5F] dark:bg-[#1E3A8A] dark:text-[#93C5FD]",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
