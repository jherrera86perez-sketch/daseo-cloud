import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/*
 * Botón portado del ERP CubaOne (`src/components/ui/forms/Button.tsx` + los
 * overrides de `src/styles/index.css:132-160`, que son los que mandan).
 *
 * Dos decisiones deliberadas:
 *
 * 1. Se conserva la API de Cloud (`default`/`outline`/`ghost`/`destructive`,
 *    `asChild`) en vez de los nombres del ERP (`primary`/`danger`/`info`).
 *    Renombrar obligaría a editar ~90 llamadas para cero ganancia visual, y
 *    `asChild` no existe en el ERP pero Cloud lo necesita para los enlaces de
 *    Next (13 archivos). Cambia el aspecto, no el contrato.
 *
 * 2. No se replica su `<style>` inline por instancia (patrón de SPA React 18:
 *    inyecta la hoja entera en cada botón renderizado). Aquí es una clase.
 *
 * El ERP aplana sus botones en index.css: `box-shadow: none !important` y
 * `active: scale(0.99)`. Se porta lo aplanado, que es lo que se ve.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap",
    "rounded-[6px] font-medium tracking-[-0.005em] select-none",
    "transition-[background-color,border-color,color] duration-[180ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
    "outline-none disabled:pointer-events-none disabled:opacity-45",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        // ── primary del ERP: navy sólido, plano, sin glow ──
        default:
          "bg-[var(--btn-primary-bg)] text-white hover:bg-[var(--btn-primary-bg-hover)] active:bg-[var(--btn-primary-bg-active)] active:scale-[0.99]",
        // ── secondary del ERP: tarjeta con borde ──
        secondary:
          "border border-border bg-card text-foreground hover:bg-surface-100 hover:border-border-hover active:bg-surface-200 active:scale-[0.98]",
        // ── danger del ERP ──
        destructive:
          "bg-[var(--btn-danger-bg)] text-white hover:bg-[var(--btn-danger-bg-hover)] active:bg-[var(--btn-danger-bg-active)] active:scale-[0.98]",
        success:
          "bg-[var(--btn-success-bg)] text-white hover:bg-[var(--btn-success-bg-hover)] active:bg-[var(--btn-success-bg-active)] active:scale-[0.98]",
        warning:
          "bg-[var(--btn-warning-bg)] text-white hover:bg-[var(--btn-warning-bg-hover)] active:bg-[var(--btn-warning-bg-active)] active:scale-[0.98]",
        // ── ghost del ERP ──
        ghost:
          "bg-transparent text-muted-foreground hover:bg-surface-100 hover:text-foreground active:bg-surface-200 active:scale-[0.98]",
        // ── outline del ERP: el hover vira a ámbar. Es su firma. ──
        outline:
          "border border-border bg-transparent text-foreground hover:border-brand-accent hover:text-brand-accent active:bg-surface-100 active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Alturas y tipos exactos del ERP (constante SIZE de su Button.tsx)
        default: "h-9 gap-[7px] px-[15px] text-[13.5px]",
        xs: "h-6 gap-1 px-2 text-[11.5px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] gap-[6px] px-[11px] text-[12.5px]",
        lg: "h-11 gap-2 px-[22px] text-[15px]",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[30px]",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  isLoading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isLoading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled || isLoading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {isLoading && !asChild ? (
        <>
          <span
            aria-hidden
            className="size-[13px] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-85"
          />
          {children ? <span className="opacity-70">{children}</span> : null}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
