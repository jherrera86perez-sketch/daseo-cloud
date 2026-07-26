import { test, expect } from "@playwright/test";
import { openNav } from "./nav";

// F2: proveedor → compra USD con lote → confirmar recepción → stock al costo
// en base + lote visible en el producto → pago parcial al proveedor.
const unique = `f2-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("compras end-to-end", () => {
  test("compra en USD entra al kardex en CUP con su lote", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario F2");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // tasa USD 320
    await openNav(page);
    await page.getByRole("link", { name: /configuración/i }).click();
    await page.getByPlaceholder(/ej\. 320/i).fill("320");
    await page.getByRole("button", { name: /registrar tasa/i }).click();
    await expect(page.getByText(/1 USD = 320/)).toBeVisible();

    // producto insumo
    await openNav(page);
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("SLES F2");
    await page.getByLabel(/unidad/i).selectOption("kg");
    await page.getByLabel(/es insumo/i).check();
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    const productUrl = page.url();

    // proveedor
    // Clientes, Proveedores y Recetas viven ahora bajo Catalogos (como el ERP):
    // se navega directo, que aqui es setup y no lo que el test verifica.
    await page.goto("/suppliers");
    await page.getByRole("link", { name: /nuevo proveedor/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Química E2E");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/suppliers/);

    // compra: 100 kg @ 1.50 USD con lote
    await openNav(page);
    await page.getByRole("link", { name: /^compras$/i }).click();
    await page.getByRole("link", { name: /nueva compra/i }).click();
    await page.getByLabel(/moneda/i).selectOption("USD");
    await expect(page.getByLabel(/tasa/i)).toHaveValue("320");
    await page.getByLabel(/producto/i).selectOption({ index: 1 });
    await page.getByLabel(/^cant\.$/i).fill("100");
    await page.getByLabel(/costo unit/i).fill("1.50");
    await page.getByLabel(/código de lote/i).fill("LOTE-E2E-1");
    await expect(page.getByText(/total: 150\.00 USD/i)).toBeVisible();
    await page.getByRole("button", { name: /guardar borrador/i }).click();
    await page.waitForURL(/\/purchases\/[0-9a-f-]+$/);

    // confirmar recepción → A-1
    await page.getByRole("button", { name: /confirmar recepción/i }).click();
    await expect(page.getByRole("heading", { name: /A-1/ })).toBeVisible({
      timeout: 20_000,
    });

    // pago parcial: 16000 CUP = 50 USD
    await page.getByPlaceholder(/^monto$/i).fill("16000.00");
    await page.getByLabel(/^moneda$/i).selectOption("CUP");
    await page.getByPlaceholder(/^tasa$/i).fill("320");
    await page.getByPlaceholder(/equivale a/i).fill("50.00");
    await page.getByRole("button", { name: /^cobrar$/i }).click();
    await expect(page.getByText(/saldo: 100\.00 USD/i)).toBeVisible();

    // producto: 100 kg @ 480.00 CUP y el lote listado
    await page.goto(productUrl);
    await expect(page.getByText(/^100 kg$/)).toBeVisible();
    await expect(page.getByText("480.00").first()).toBeVisible();
    await expect(page.getByText("LOTE-E2E-1")).toBeVisible();
  });
});
