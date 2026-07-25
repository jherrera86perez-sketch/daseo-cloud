import * as React from "react";

import { cn } from "@/lib/utils";

/* Textarea portado del ERP CubaOne (`src/components/ui/forms/Textarea.tsx`). */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-[6px] border border-border bg-background px-3 py-2 text-sm text-foreground",
        "field-sizing-content min-h-16 resize-y",
        "transition-[background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
        "outline-none placeholder:text-text-muted",
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

export { Textarea };
