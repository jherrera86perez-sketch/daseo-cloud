"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/*
 * ConfirmDialog portado del ERP CubaOne
 * (`src/components/ui/feedback/ConfirmDialog.tsx`). Envuelve el Modal en
 * tamaño `sm`; el botón de confirmar vira a `destructive` cuando el tono lo es.
 *
 * Sustituye a los `window.confirm()` nativos que Cloud usa hoy en los borrados
 * — que además bloquean el hilo del navegador.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = "danger",
  isPending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-sm text-muted-foreground">{message}</p>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          variant={tone === "danger" ? "destructive" : "default"}
          size="sm"
          isLoading={isPending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
