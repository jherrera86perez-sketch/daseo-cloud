import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Card portado del ERP CubaOne (`src/components/Card.tsx` + los overrides
 * Linear de `index.css:139-147`).
 *
 * Medidas literales: radio 8px, borde 1px, `--shadow-sm`, padding md
 * "20px 24px", título en font-display 16px/600, transición 220ms.
 *
 * El hover NO levanta la tarjeta: el ERP lo aplana en index.css
 * (`transform: none !important`), sólo cambia borde y fondo. Es la diferencia
 * entre parecerse al ERP y sentirse como él.
 *
 * Se conserva la API de Cloud (7 sub-componentes, 151 usos) — sólo cambia el
 * aspecto, igual que con los tokens y el Button.
 */
function Card({
  className,
  hoverable = false,
  elevated = false,
  ...props
}: React.ComponentProps<"div"> & {
  hoverable?: boolean;
  elevated?: boolean;
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-md border border-border bg-card py-5 text-card-foreground",
        "transition-[box-shadow,border-color,background-color] duration-[220ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
        elevated ? "shadow-[var(--shadow-md)]" : "shadow-[var(--shadow-sm)]",
        hoverable && "hover:border-border-hover hover:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("t-display text-base leading-none", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-5", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
