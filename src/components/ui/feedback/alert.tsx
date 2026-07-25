import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Alert portado del ERP CubaOne (`src/components/ui/feedback/Alert.tsx`).
 * Mismos pares de color que el Badge, más un borde izquierdo de 3px del tono.
 * Es el banner que abre Control de Caja ("7 cobros sin vincular…") y el de
 * Modelos Fiscales ("Banco conciliado — confianza alta").
 *
 * Server component.
 */
const TONES = {
  info: {
    box: "bg-[#DBEAFE] text-[#1E3A5F] border-l-[#1E3A5F] dark:bg-[#1E3A8A] dark:text-[#93C5FD] dark:border-l-[#5B8BD8]",
    Icon: Info,
  },
  success: {
    box: "bg-[#DCFCE7] text-[#14532D] border-l-[#15803D] dark:bg-[#052E16] dark:text-[#4ADE80] dark:border-l-[#22C55E]",
    Icon: CheckCircle2,
  },
  warning: {
    box: "bg-[#FEF3C7] text-[#78350F] border-l-[#B45309] dark:bg-[#451A03] dark:text-[#FCD34D] dark:border-l-[#F59E0B]",
    Icon: AlertTriangle,
  },
  danger: {
    box: "bg-[#FEE2E2] text-[#7F1D1D] border-l-[#B91C1C] dark:bg-[#450A0A] dark:text-[#F87171] dark:border-l-[#EF4444]",
    Icon: XCircle,
  },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONES[tone];

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-md border-l-[3px] px-4 py-3 text-sm",
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-0.5")}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
