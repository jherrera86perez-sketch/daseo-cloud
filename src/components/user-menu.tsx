"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Menú de usuario portado del ERP CubaOne
 * (`src/components/UserMenuDropdown.tsx` + `Avatar.tsx`).
 *
 * Avatar con iniciales, nombre y rol debajo, y un desplegable que se cierra al
 * pulsar fuera o con Escape. El contenido del desplegable (tema, idioma,
 * cerrar sesión) llega ya renderizado desde el layout, que es server: así los
 * selectores siguen siendo los mismos componentes de siempre.
 */
function initials(text: string) {
  const parts = text.split(/[@.\s]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export function UserMenu({
  name,
  role,
  label,
  children,
}: {
  name: string;
  role: string;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors",
          "hover:bg-surface-100",
        )}
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
        >
          {initials(name)}
        </span>
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block truncate text-xs font-medium">{name}</span>
          <span className="t-label block">{role}</span>
        </span>
        <ChevronDown
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute top-[calc(100%+6px)] right-0 z-50 w-56 rounded-md border border-border bg-popover p-2",
            "shadow-[var(--shadow-lg)]",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
