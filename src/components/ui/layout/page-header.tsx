import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * PageHeader portado del ERP CubaOne (`src/components/layout/PageLayout.tsx`,
 * bloque `.page-header`).
 *
 * Su firma visual son tres cosas concretas:
 *  1. Título en font-display con letter-spacing -0.025em.
 *  2. Subtítulo en font-display CURSIVA de peso 300 — no es un italic
 *     genérico, es la fuente display en cursiva.
 *  3. Una regla ámbar de 64px × 1px pegada al borde inferior, a 24px de la
 *     izquierda, con glow y opacidad 0.7. En la variante `large` mide 80px.
 *
 * `large` es la cabecera del Panel de Control y el Panel del Negocio: añade el
 * eyebrow en mono (p. ej. "№ 07 · 2026") y sube el título a 32px.
 *
 * Server component.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  large = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  large?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 shrink-0">
        {eyebrow ? <p className="t-eyebrow-amber mb-2">{eyebrow}</p> : null}

        <h1
          className={cn(
            "t-display leading-tight tracking-[-0.025em]",
            large ? "text-[32px]" : "text-2xl",
          )}
        >
          {title}
        </h1>

        {subtitle ? (
          <p className="t-display-italic mt-1.5 truncate text-sm text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}

      {/* Regla ámbar del ERP */}
      <span
        aria-hidden
        className={cn(
          "absolute bottom-0 h-px bg-brand-accent opacity-70",
          "shadow-[0_0_12px_rgba(180,83,9,0.4)]",
          large ? "left-0 w-20" : "left-0 w-16",
        )}
      />
    </header>
  );
}
