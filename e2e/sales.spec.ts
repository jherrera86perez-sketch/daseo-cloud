import { test, expect } from "@playwright/test";
import { openNav } from "./nav";

// Flujo M5 completo: tasa → cliente → producto+stock → venta USD 2 líneas →
// confirmar (número + stock) → cobro parcial en CUP → saldo correcto.
const unique = `m5-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("ventas: multi-moneda end-to-end", () => {
  test("venta en USD con cobro cruzado en CUP", async ({ page }) => {
    // registro + org (base CUP)
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario M5");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // tasa USD = 320
    await openNav(page);
    await page.getByRole("link", { name: /configuración/i }).click();
    await page.getByPlaceholder(/ej\. 320/i).fill("320");
    await page.getByRole("button", { name: /registrar tasa/i }).click();
    await expect(page.getByText(/1 USD = 320/)).toBeVisible();

    // cliente
    // Clientes, Proveedores y Recetas viven ahora bajo Catalogos (como el ERP):
    // se navega directo, que aqui es setup y no lo que el test verifica.
    await page.goto("/customers");
    await page.getByRole("link", { name: /nuevo cliente/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Bodega Ventas");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);

    // producto con stock
    await openNav(page);
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo producto/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Detergente Venta");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    await page.getByPlaceholder(/^cantidad$/i).fill("50");
    await page.getByPlaceholder(/costo unit/i).fill("100.00");
    await page.getByRole("button", { name: /^registrar$/i }).click();
    await expect(page.getByText(/^50 ud$/)).toBeVisible();

    // venta en USD: 10 uds del producto a 2.00 + flete libre 5.00
    await openNav(page);
    await page.getByRole("link", { name: /^ventas$/i }).click();
    await page.getByRole("link", { name: /nueva venta/i }).click();
    await page.getByLabel(/moneda/i).selectOption("USD");
    await expect(page.getByLabel(/tasa/i)).toHaveValue("320");
    await page
      .getByLabel(/producto/i)
      .first()
      .selectOption({ index: 1 });
    await page
      .getByLabel(/^cant\.$/i)
      .first()
      .fill("10");
    await page
      .getByLabel(/^precio$/i)
      .first()
      .fill("2.00");
    await page.getByRole("button", { name: /agregar línea/i }).click();
    await page
      .getByLabel(/descripción/i)
      .nth(1)
      .fill("Flete");
    await page
      .getByLabel(/^cant\.$/i)
      .nth(1)
      .fill("1");
    await page
      .getByLabel(/^precio$/i)
      .nth(1)
      .fill("5.00");
    await expect(page.getByText(/total: 25\.00 USD/i)).toBeVisible();
    await page.getByRole("button", { name: /guardar borrador/i }).click();
    await page.waitForURL(/\/sales\/[0-9a-f-]+$/);

    // confirmar → asigna A-1 y descuenta stock
    await page.getByRole("button", { name: /confirmar venta/i }).click();
    await expect(page.getByRole("heading", { name: /A-1/ })).toBeVisible();

    // cobro cruzado: 3200 CUP = 10 USD
    await page.getByPlaceholder(/^monto$/i).fill("3200.00");
    await page.getByLabel(/^moneda$/i).selectOption("CUP");
    await page.getByPlaceholder(/^tasa$/i).fill("320");
    await page.getByPlaceholder(/equivale a/i).fill("10.00");
    await page.getByRole("button", { name: /^cobrar$/i }).click();
    await expect(page.getByText(/saldo: 15\.00 USD/i)).toBeVisible();

    // dashboard (M9): consolidado a tasa fijada y CxC con el saldo
    await openNav(page);
    await page.getByRole("link", { name: /panel/i }).click();
    await expect(page.getByText("8000.00")).toBeVisible(); // 25 USD × 320
    // El hero del panel anade su propio rotulo "Cuentas por cobrar": se apunta
    // al titulo exacto de la tarjeta para no casar con ambos.
    await expect(
      page.getByText("Cuentas por cobrar", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/15\.00 USD/).first()).toBeVisible();
  });
});
