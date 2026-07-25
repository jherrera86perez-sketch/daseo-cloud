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
  if (!(await burger.isVisible().catch(() => false))) return;

  // El cajón entra con `transition-transform`. Mientras anima, Playwright lo
  // considera "not stable" y reintenta el clic hasta agotar el timeout. Se
  // desactivan las animaciones: el cajón aparece de golpe y desaparece toda
  // esa clase de fragilidad, no sólo este caso.
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });

  await burger.click();
}

/**
 * Pulsa un enlace del menú lateral de forma determinista.
 *
 * En el cajón móvil el `<nav>` tiene scroll propio: entre que Playwright
 * localiza el enlace y hace clic, el contenedor puede desplazarse y el punto
 * de clic acaba sobre el enlace vecino ("… intercepts pointer events").
 * Desplazarlo explícitamente antes de pulsar elimina esa carrera.
 *
 * Úsalo para enlaces que quedan lejos en la lista; para los primeros basta con
 * `openNav`.
 */
export async function clickNav(page: Page, name: RegExp | string) {
  await openNav(page);
  const link = page.getByRole("link", { name });
  await link.scrollIntoViewIfNeeded();
  await link.click();
}
