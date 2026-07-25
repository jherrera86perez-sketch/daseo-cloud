import { test, expect } from "@playwright/test";
import { openNav } from "./nav";

// M8: receta → orden → confirmar con merma y mano de obra → stock del
// terminado con costo real visible en su kardex.
const unique = `m8-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("producción end-to-end", () => {
  test("orden confirmada produce stock con costo real", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario M8");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // insumo 100 kg @ 50.00
    await openNav(page);
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("SLES M8");
    await page.getByLabel(/unidad/i).selectOption("kg");
    await page.getByLabel(/es insumo/i).check();
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    await page.getByPlaceholder(/^cantidad$/i).fill("100");
    await page.getByPlaceholder(/costo unit/i).fill("50.00");
    await page.getByRole("button", { name: /^registrar$/i }).click();
    await expect(page.getByText(/^100 kg$/)).toBeVisible();

    // terminado producible
    await openNav(page);
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Detergente M8");
    await page.getByLabel(/unidad/i).selectOption("L");
    await page.getByLabel(/se produce/i).check();
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    const productUrl = page.url();

    // receta 10 kg → 100 L
    await openNav(page);
    await page.getByRole("link", { name: /recetas/i }).click();
    await page.getByRole("link", { name: /nueva receta/i }).click();
    await page.getByLabel(/nombre de la fórmula/i).fill("Fórmula M8");
    await page.getByLabel(/rinde/i).fill("100");
    await page.getByLabel(/^cantidad$/i).fill("10");
    await page.getByRole("button", { name: /guardar receta/i }).click();
    await page.waitForURL(/\/recipes\/[0-9a-f-]+$/);

    // orden de producción
    await openNav(page);
    await page.getByRole("link", { name: /producción/i }).click();
    await page.getByRole("button", { name: /nueva orden/i }).click();
    await page.waitForURL(/\/production\/[0-9a-f-]+$/);

    // confirmar: real 11 kg, produce 98 L, mano de obra 200, indirectos 100
    await page.getByLabel(/real sles m8/i).fill("11");
    await page.getByLabel(/^producido$/i).fill("98");
    await page.getByLabel(/mano de obra/i).fill("200.00");
    await page.getByLabel(/costos indirectos/i).fill("100.00");
    await page.getByRole("button", { name: /confirmar producción/i }).click();
    // la transacción hace varios movimientos contra Neon: margen para CI remoto
    await expect(page.getByText(/el costo real/i)).toBeVisible({
      timeout: 20_000,
    });

    // kardex del terminado: 98 L al costo real ~8.67/L (850/98)
    await page.goto(productUrl);
    await expect(page.getByText(/^98 L$/)).toBeVisible();
    await expect(page.getByText("8.67").first()).toBeVisible();
  });
});
