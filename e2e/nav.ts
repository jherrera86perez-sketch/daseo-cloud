import type { Page } from "@playwright/test";

/**
 * Abre el cajón lateral si estamos en un viewport móvil.
 *
 * A partir de la paridad visual con el ERP, por debajo de 1024px la barra
 * lateral es un cajón fuera de pantalla: hay que pulsar la hamburguesa antes
 * de tocar un enlace de navegación, igual que hace una persona con el
 * teléfono. En escritorio el botón no existe y esta llamada no hace nada.
 *
 * Sin esto los 17 tests móviles fallan con "element is outside of the
 * viewport": el enlace existe y está visible, pero desplazado fuera.
 */
export async function openNav(page: Page) {
  const burger = page.getByRole("button", { name: "Abrir menú" });
  if (await burger.isVisible().catch(() => false)) {
    await burger.click();
  }
}
