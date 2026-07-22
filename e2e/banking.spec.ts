import { test, expect } from "@playwright/test";

// F3: venta cobrada por transferencia → cuenta bancaria → importar CSV →
// sugerencia de conciliación → vincular → conciliado.
const unique = `f3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("banco: conciliación end-to-end", () => {
  test("importa CSV y concilia el cobro sugerido", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario F3");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // cliente + venta CUP 8000 confirmada + cobro por transferencia
    await page.getByRole("link", { name: /clientes/i }).click();
    await page.getByRole("link", { name: /nuevo cliente/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Bodega Banco");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);

    await page.getByRole("link", { name: /^ventas$/i }).click();
    await page.getByRole("link", { name: /nueva venta/i }).click();
    await page
      .getByLabel(/descripción/i)
      .first()
      .fill("Pedido banco");
    await page
      .getByLabel(/^cant\.$/i)
      .first()
      .fill("1");
    await page
      .getByLabel(/^precio$/i)
      .first()
      .fill("8000.00");
    await page.getByRole("button", { name: /guardar borrador/i }).click();
    await page.waitForURL(/\/sales\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: /confirmar venta/i }).click();
    await expect(page.getByRole("heading", { name: /A-1/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByPlaceholder(/^monto$/i).fill("8000.00");
    await page
      .getByRole("combobox")
      .filter({ hasText: "Efectivo" })
      .selectOption("transfer");
    await page.getByRole("button", { name: /^cobrar$/i }).click();
    await expect(page.getByText(/pagada por completo/i)).toBeVisible();

    // cuenta bancaria + CSV con el ingreso
    await page.getByRole("link", { name: /^banco$/i }).click();
    await page.getByLabel(/nombre de la cuenta/i).fill("BANDEC CUP");
    await page.getByRole("button", { name: /crear cuenta/i }).click();
    await page.waitForURL(/\/banking\/[0-9a-f-]+$/);

    const today = new Date().toISOString().slice(0, 10);
    await page
      .getByLabel(/pega el csv/i)
      .fill(
        `fecha,descripcion,monto,referencia\n${today},TRANSFERENCIA BODEGA BANCO,8000.00,TRF-9`,
      );
    await page.getByRole("button", { name: /^importar$/i }).click();
    await expect(page.getByText(/1 importados/i)).toBeVisible();
    await expect(page.getByText("TRANSFERENCIA BODEGA BANCO")).toBeVisible();

    // sugerencia con el cobro → vincular
    await page.getByRole("button", { name: /vincular: A-1/i }).click();
    await expect(page.getByText(/^conciliado$/i)).toBeVisible();
  });
});
