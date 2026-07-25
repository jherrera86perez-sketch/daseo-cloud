"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ModalPortal } from "./modal-portal";

/*
 * Modal portado del ERP CubaOne (`src/components/Modal.tsx`).
 *
 * Cloud no tenía NINGÚN componente de diálogo: es el hueco más grande de la
 * fundación. El ERP lo usa para casi todo (≈55 archivos con overlay).
 *
 * Fiel al original: backdrop `rgba(6,9,15,0.82)` con blur de 8px y 16px de
 * aire, diálogo con radio 8px sobre fondo de tarjeta, cabecera de 20px/24px
 * con título en font-display 18px/600, cierre con Escape y bloqueo del scroll
 * del body. Incluye su línea amber en degradado sobre el borde superior.
 *
 * Convive con la arquitectura de Cloud: el modal es cliente, pero el
 * formulario que lleva dentro sigue enviando por server action con
 * `useActionState`. No cambia nada del backend.
 *
 * Adaptación responsive acordada en el spec: a pantalla completa por debajo
 * de 1024px, centrado con ancho máximo por encima.
 */
const SIZES = {
  sm: "lg:max-w-[400px]",
  md: "lg:max-w-[600px]",
  lg: "lg:max-w-[800px]",
  xl: "lg:max-w-[1100px]",
  "2xl": "lg:max-w-[1400px]",
} as const;

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  closeOnOverlayClick = true,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: keyof typeof SIZES;
  closeOnOverlayClick?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-stretch justify-center bg-[rgba(6,9,15,0.82)] backdrop-blur-[8px] lg:items-center lg:p-4"
        onClick={closeOnOverlayClick ? onClose : undefined}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden bg-card text-card-foreground",
            "lg:h-auto lg:max-h-[calc(100vh-32px)] lg:rounded-md lg:border lg:border-border",
            SIZES[size],
          )}
        >
          {/* Línea amber en degradado del ERP sobre el borde superior */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,var(--brand-accent)_30%,var(--brand-accent)_70%,transparent_100%)]"
          />

          {title ? (
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-5">
              <h2 className="t-display text-lg">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="-mr-1 rounded-[6px] p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {children}
          </div>

          {footer ? (
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </footer>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
