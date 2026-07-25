"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { List, Rows3, StretchVertical } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * DensityToggle portado del ERP CubaOne
 * (`src/components/ui/atoms/DensityToggle.tsx` + `useTableDensity.ts`).
 *
 * Aparece en la barra de 7 pantallas del ERP (Ventas, CxC, CxP, Compras,
 * Inventario, Producción, Auditoría). Lo descubrimos capturando las
 * referencias: no estaba en el inventario inicial de componentes.
 *
 * En el ERP funciona con clases envoltorio (`.dt-density-*`) alrededor de
 * cada tabla. Aquí escribe `data-density` en <html> —como hace next-themes
 * con el tema— para que las tablas sigan siendo server components y no haya
 * que pasar la densidad por props hasta el fondo del árbol.
 */
const OPTIONS = [
  { id: "compact", label: "Compacta", Icon: List },
  { id: "cozy", label: "Cómoda", Icon: Rows3 },
  { id: "comfortable", label: "Espaciosa", Icon: StretchVertical },
] as const;

export type Density = (typeof OPTIONS)[number]["id"];

const STORAGE_KEY = "tableDensity";
const DEFAULT: Density = "cozy";

/*
 * `localStorage` es un external store, así que se lee con
 * useSyncExternalStore. El lint de React 19 prohíbe `setState` dentro de un
 * effect (misma piedra que en el tema oscuro y en los sorteos), y este patrón
 * además resuelve la hidratación: el servidor devuelve siempre el valor por
 * defecto y el cliente se sincroniza sin parpadeo de estado.
 */
const EVENT = "daseo:density";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Density {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "compact" || saved === "cozy" || saved === "comfortable"
    ? saved
    : DEFAULT;
}

export function DensityToggle({ className }: { className?: string }) {
  const density = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const pick = useCallback((next: Density) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return (
    <div
      role="group"
      aria-label="Densidad de la tabla"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => pick(id)}
          aria-pressed={density === id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-xs font-medium",
            "transition-colors duration-[180ms]",
            density === id
              ? "bg-surface-200 text-foreground"
              : "text-muted-foreground hover:bg-surface-100 hover:text-foreground",
          )}
        >
          <Icon className="size-[13px]" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
