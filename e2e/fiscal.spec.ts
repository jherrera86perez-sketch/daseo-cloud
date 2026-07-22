import { test, expect } from "@playwright/test";

// F4: venta 100,000 CUP → fiscal → calcular mes → 10% ONAT visible →
// marcar anticipo pagado → DJ-08 lo descuenta.
const unique = `f4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("fiscal ONAT end-to-end", () => {
  test("obligaciones del mes y proyección DJ-08", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario F4");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // cliente + venta confirmada 100,000 CUP
    await page.getByRole("link", { name: /clientes/i }).click();
    await page.getByRole("link", { name: /nuevo cliente/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Cliente Fiscal");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);

    await page.getByRole("link", { name: /^ventas$/i }).click();
    await page.getByRole("link", { name: /nueva venta/i }).click();
    await page
      .getByLabel(/descripción/i)
      .first()
      .fill("Venta fiscal");
    await page
      .getByLabel(/^cant\.$/i)
      .first()
      .fill("1");
    await page
      .getByLabel(/^precio$/i)
      .first()
      .fill("100000.00");
    await page.getByRole("button", { name: /guardar borrador/i }).click();
    await page.waitForURL(/\/sales\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: /confirmar venta/i }).click();
    await expect(page.getByRole("heading", { name: /A-1/ })).toBeVisible({
      timeout: 20_000,
    });

    // fiscal: guardar configuración (país CU) y calcular
    await page.getByRole("link", { name: /^fiscal$/i }).click();
    await page.getByRole("button", { name: /^guardar$/i }).click();
    await expect(
      page.getByText(/configuración fiscal guardada/i),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /calcular con las ventas/i })
      .click();

    // 10% de ventas = 10,000.00 con código ONAT real
    await expect(page.getByText("011402")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("10000.00").first()).toBeVisible();

    // marcar pagado el pago a cuenta (051012, 5,000.00)
    const anticipoRow = page.locator("tr", { hasText: "051012" });
    await anticipoRow.getByRole("button", { name: /marcar pagada/i }).click();
    await expect(anticipoRow.getByText(/^pagada$/i)).toBeVisible();

    // DJ-08 visible con la escala
    await expect(page.getByText(/proyección dj-08/i)).toBeVisible();
    await expect(page.getByText(/50%/)).toBeVisible();
  });
});
