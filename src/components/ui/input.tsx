import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Input portado del ERP CubaOne (`src/components/ui/forms/Input.tsx`).
 * Medidas literales: alto 38px, radio 6px, texto 14px, transición 180ms con
 * la curva del ERP. Fondo `--background` en reposo y `--card` al enfocar —
 * detalle suyo: el campo "se enciende" al recibir foco.
 *
 * No se portan `label`/`error`/`hint`/`leftIcon`: en el ERP van dentro del
 * propio Input; aquí viven en `FormField`, que es donde Cloud ya los pone.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[38px] w-full min-w-0 rounded-[6px] border border-border bg-background px-3 text-sm text-foreground",
        "transition-[background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
        "outline-none placeholder:text-text-muted",
        "hover:enabled:border-border-hover",
        "focus-visible:border-primary focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-[var(--primary-muted)]",
        "aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
