import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/*
 * Primitivas de tabla con la piel del ERP CubaOne
 * (`src/components/ui/DataTable.tsx` + `Table.tsx`).
 *
 * SÓLO se porta la piel. El DataTable del ERP trae orden, filtrado y
 * paginación en cliente; varias listas de Cloud (Ventas, Compras, Estados de
 * Cuenta) ya lo resuelven en servidor con `searchParams` — es mejor, está
 * testeado y visualmente es indistinguible. Excepción documentada en el spec.
 *
 * El padding de celda NO se declara aquí: lo gobierna la capa de densidad de
 * `globals.css` (`table th, table td` por defecto + los overrides
 * `[data-density=…]` que escribe el DensityToggle). Poner utilidades aquí
 * ganaría a esas reglas y dejaría el toggle sin efecto.
 *
 * Todos server components.
 */

export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // overflow-x-auto es obligatorio: sin él los clics táctiles se rompen a
    // 375px (gotcha documentado en F4).
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table
        data-slot="data-table"
        className={cn(
          "w-full border-collapse text-left text-[13px]",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-100">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        "border-b border-surface-100 transition-colors duration-150 last:border-0",
        "hover:bg-surface-hover",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({
  numeric,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        // Cabecera del ERP: mono, versalitas, muy espaciada, en gris atenuado
        "font-mono text-[10px] font-semibold tracking-wider text-text-muted uppercase",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  numeric,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "text-foreground",
        numeric && "t-num text-right",
        className,
      )}
      {...props}
    />
  );
}

/* Pie de tabla del ERP: borde superior, fondo de tarjeta, para paginación. */
export function TableFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border bg-card px-4 pt-2 pb-4 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
