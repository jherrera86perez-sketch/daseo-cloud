import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Select portado del ERP CubaOne (`src/components/ui/forms/Select.tsx`).
 * Ojo al detalle: el ERP usa radio 8px aquí y 6px en el Input. No es un
 * descuido nuestro — es así en el original y se replica.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-[38px] w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground",
        "transition-[background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
        "outline-none",
        "hover:enabled:border-border-hover",
        "focus-visible:border-primary focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-[var(--primary-muted)]",
        "aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
