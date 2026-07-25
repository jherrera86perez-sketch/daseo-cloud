import type { ReactNode } from "react";

/*
 * TableEmptyRow portado del ERP CubaOne
 * (`src/components/ui/atoms/TableEmptyRow.tsx`). Fila de estado vacío que
 * ocupa toda la tabla, con el mensaje centrado en gris atenuado.
 *
 * Server component.
 */
export function TableEmptyRow({
  colSpan,
  message,
  icon,
}: {
  colSpan: number;
  message: string;
  icon?: ReactNode;
}) {
  return (
    <tr data-slot="table-empty-row">
      <td colSpan={colSpan} className="px-3 py-10 text-center">
        <div className="flex flex-col items-center gap-2">
          {icon ? (
            <span className="text-text-muted" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="text-sm text-muted-foreground">{message}</span>
        </div>
      </td>
    </tr>
  );
}
