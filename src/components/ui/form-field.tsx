import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * FormField portado del ERP CubaOne (`src/components/FormField.tsx`).
 * Medidas literales: etiqueta 14px/500 en texto secundario con 6px de aire
 * bajo ella; pista y error a 12px con 4px de aire encima; el asterisco de
 * obligatorio en rojo claro a 4px de la etiqueta.
 *
 * Server component: no lleva estado. Las animaciones de entrada del ERP
 * (fadeIn/slideIn) no se portan — dependen de su `<style>` inyectado y aportan
 * poco frente al coste de volverlo cliente.
 */
export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("block", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 block text-sm font-medium text-muted-foreground"
        >
          {label}
          {required ? (
            <span className="ml-1 text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children}

      {hint && !error ? (
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
      ) : null}

      {error ? (
        <p className="mt-1 text-xs font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
