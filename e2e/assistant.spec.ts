import { test, expect } from "@playwright/test";
import { openNav } from "./nav";

// Asistente directivo (port fiel del ERP): producto bajo mínimo → recomendación
// "Stock bajo" en /assistant → marcarla Completada en el seguimiento.
const unique = `ad-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("asistente directivo: recomendación → seguimiento", () => {
  test("stock bajo mínimo genera recomendación y se completa", async ({
    page,
  }) => {
    // registro + org
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario AD");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // producto con stock mínimo 10
    await openNav(page);
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Jabón AD");
    await page.getByLabel(/stock mínimo/i).fill("10");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);

    // entrada de 5 (quedará BAJO_MIN: 5 < 10)
    await page.getByPlaceholder(/^cantidad$/i).fill("5");
    await page.getByPlaceholder(/costo unit/i).fill("100.00");
    await page.getByRole("button", { name: /^registrar$/i }).click();
    await expect(page.locator("table tbody tr")).toHaveCount(1);

    // el Panel del Negocio muestra la recomendación literal del ERP
    await openNav(page);
    await page.getByRole("link", { name: /^asistente$/i }).click();
    await page.waitForURL(/\/assistant/);
    await expect(page.getByText("Stock bajo: Jabón AD").first()).toBeVisible();
    await expect(page.getByText(/alertas/).first()).toBeVisible();

    // seguimiento: completar la recomendación (upsert por recomendacion_id)
    await page
      .getByRole("button", { name: /^completar$/i })
      .first()
      .click();
    await expect(page.getByText(/^completada$/i).first()).toBeVisible();

    // persiste tras recargar (estado en asistente_seguimiento)
    await page.reload();
    await expect(page.getByText(/^completada$/i).first()).toBeVisible();
  });
});
