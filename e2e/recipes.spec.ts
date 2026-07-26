import { test, expect } from "@playwright/test";
import { openNav } from "./nav";

// M7: insumos con costo → producto terminado → receta → costo teórico visible
const unique = `m7-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("recetas: costo teórico end-to-end", () => {
  test("crear receta y ver el costo del lote", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario M7");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // insumo con stock 100 kg @ 50.00
    await openNav(page);
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("SLES 70");
    await page.getByLabel(/unidad/i).selectOption("kg");
    await page.getByLabel(/se vende/i).uncheck();
    await page.getByLabel(/es insumo/i).check();
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    await page.getByPlaceholder(/^cantidad$/i).fill("100");
    await page.getByPlaceholder(/costo unit/i).fill("50.00");
    await page.getByRole("button", { name: /^registrar$/i }).click();
    await expect(page.getByText(/^100 kg$/)).toBeVisible();

    // producto terminado producible
    await openNav(page);
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Detergente M7");
    await page.getByLabel(/unidad/i).selectOption("L");
    await page.getByLabel(/se produce/i).check();
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);

    // receta: 10 kg SLES rinde 100 L
    // Clientes, Proveedores y Recetas viven ahora bajo Catalogos (como el ERP):
    // se navega directo, que aqui es setup y no lo que el test verifica.
    await page.goto("/recipes");
    await page.getByRole("link", { name: /nueva receta/i }).click();
    await page.getByLabel(/nombre de la fórmula/i).fill("Fórmula E2E");
    await page.getByLabel(/rinde/i).fill("100");
    await page.getByLabel(/^cantidad$/i).fill("10");
    await page.getByRole("button", { name: /guardar receta/i }).click();
    await page.waitForURL(/\/recipes\/[0-9a-f-]+$/);

    // costo teórico: 10 × 50.00 = 500.00 el lote; 5.00 unitario
    await expect(page.getByText(/costo del lote/i)).toBeVisible();
    await expect(page.getByText("500.00").first()).toBeVisible();
    await expect(page.getByText("5.00").first()).toBeVisible();
  });
});
