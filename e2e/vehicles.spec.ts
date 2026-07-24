import { test, expect } from "@playwright/test";

// M-RESTO: registro de vehículos (ONAT 071012, "La Chapa") — CRUD simple +
// suma anual informativa de las categorías activas.
const unique = `vh-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("vehículos end-to-end", () => {
  test("agregar dos vehículos suma la cuota anual; dar de baja la excluye", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario VH");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.getByRole("link", { name: /veh[ií]culos/i }).click();
    await page.waitForURL(/\/vehicles/);

    // A_MOTO = 110.00
    await page.getByLabel(/^placa$/i).fill("MOTO-1");
    await page.getByLabel(/categoría fiscal/i).selectOption("A_MOTO");
    await page.getByRole("button", { name: /^agregar$/i }).click();
    await expect(page.getByText(/veh[ií]culo agregado/i)).toBeVisible();

    // B_CARGA_MEDIA = 450.00
    await page.getByLabel(/^placa$/i).fill("CAMION-1");
    await page.getByLabel(/categoría fiscal/i).selectOption("B_CARGA_MEDIA");
    await page.getByRole("button", { name: /^agregar$/i }).click();
    await expect(page.getByText("CAMION-1")).toBeVisible();

    // total anual = 110.00 + 450.00 = 560.00
    const totalLine = page.getByText(/total anual/i);
    await expect(totalLine).toContainText("560.00");

    // dar de baja el camión → total baja a 110.00
    const camionRow = page.locator("tr", { hasText: "CAMION-1" });
    await camionRow.getByRole("button", { name: /dar de baja/i }).click();
    await expect(totalLine).toContainText("110.00");
    await expect(page.getByText(/vendido/i)).toBeVisible();
  });
});
