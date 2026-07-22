import { test, expect } from "@playwright/test";

// Flujo M4: producto → entrada 100@50 → salida 30 → kardex saldo 70 avg 50.00
const unique = `m4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("inventario: kardex end-to-end", () => {
  test("entrada y salida actualizan saldo y costo promedio", async ({
    page,
  }) => {
    // registro + org
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario M4");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // crear producto
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Detergente E2E");
    await page.getByLabel(/unidad/i).selectOption("L");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);

    // entrada 100 @ 50.00
    await page.getByPlaceholder(/^cantidad$/i).fill("100");
    await page.getByPlaceholder(/costo unit/i).fill("50.00");
    await page.getByRole("button", { name: /^registrar$/i }).click();
    await expect(page.getByText(/^100 L$/)).toBeVisible();
    await expect(page.getByText("50.00").first()).toBeVisible();

    // salida 30 (al promedio)
    await page.getByLabel(/tipo de movimiento/i).selectOption("out");
    await page.getByPlaceholder(/^cantidad$/i).fill("30");
    await page.getByRole("button", { name: /^registrar$/i }).click();
    await expect(page.getByText(/^70 L$/)).toBeVisible();

    // el kardex tiene 2 filas
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(2);
  });
});
