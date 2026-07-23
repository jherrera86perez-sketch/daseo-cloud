import { test, expect } from "@playwright/test";

// Flujo M3: crear cliente → registrar interacción → ver timeline → editar.
// Crea su propio usuario+org (aislado de otras corridas).
const unique = `m3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("clientes: patrón CRUD + ficha", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("crear, interactuar y editar un cliente", async ({ page }) => {
    // registro + org
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario M3");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // estado vacío
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await expect(page.getByText(/aún no tienes clientes/i)).toBeVisible();

    // crear
    await page.getByRole("link", { name: /nuevo cliente/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Bodega E2E");
    await page.getByLabel(/teléfono/i).fill("+53 5555 0000");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "Bodega E2E" }),
    ).toBeVisible();

    // interacción
    await page
      .getByPlaceholder(/qué pasó con este cliente/i)
      .fill("Llamada de prueba E2E");
    await page.getByRole("button", { name: /registrar/i }).click();
    await expect(page.getByText("Llamada de prueba E2E")).toBeVisible();

    // editar
    await page.getByRole("link", { name: /editar/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Bodega E2E Editada");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "Bodega E2E Editada" }),
    ).toBeVisible();

    // aparece en la lista
    await page
      .getByRole("link", { name: "Clientes", exact: true })
      .first()
      .click();
    await expect(page.getByText("Bodega E2E Editada")).toBeVisible();
  });
});
