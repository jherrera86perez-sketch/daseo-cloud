import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { Modal } from "./modal";

/*
 * El Modal es la única pieza de la fundación con comportamiento propio
 * (Escape, bloqueo de scroll, portal, clic en backdrop) y ningún E2E lo
 * ejercita todavía — se conecta a las pantallas en la fase 4. Estos tests son
 * su red hasta entonces.
 *
 * El resto de primitivas portadas son presentacionales y no llevan test, mismo
 * criterio que la paridad del chrome del 24-jul.
 */
const messages = {
  common: { close: "Cerrar", cancel: "Cancelar", save: "Guardar" },
};

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <Modal open onClose={onClose} title="Nueva Venta" {...props}>
        <p>contenido</p>
      </Modal>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Modal", () => {
  it("no renderiza nada cuando open es false", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renderiza el diálogo con su título accesible", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Nueva Venta");
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("bloquea el scroll del body mientras está abierto y lo restaura al cerrar", () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <Modal open onClose={vi.fn()} title="X">
          <p>y</p>
        </Modal>
      </NextIntlClientProvider>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("cierra con Escape", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cierra con el botón de cerrar, que toma su etiqueta de i18n", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no cierra al pulsar dentro del diálogo", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("contenido"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("con closeOnOverlayClick=false el backdrop no cierra", () => {
    const { onClose } = renderModal({ closeOnOverlayClick: false });
    // El backdrop es el padre del diálogo
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});
