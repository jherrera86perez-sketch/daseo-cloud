import { cn } from "@/lib/utils";

/*
 * StatusDot portado del ERP CubaOne (`src/components/ui/atoms/StatusDot.tsx`).
 * El punto de color que precede a cada fila de "Por estado" en los paneles
 * laterales y a los rangos de atraso en CxC/CxP.
 *
 * Server component.
 */
const TONES = {
  neutral: "bg-text-muted",
  primary: "bg-primary",
  success: "bg-[#16A34A]",
  warning: "bg-[#D97706]",
  danger: "bg-[#DC2626]",
} as const;

export function StatusDot({
  tone = "neutral",
  className,
}: {
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="status-dot"
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full",
        TONES[tone],
        className,
      )}
    />
  );
}
