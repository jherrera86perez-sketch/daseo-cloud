import { test, expect } from "@playwright/test";
import { openNav } from "./nav";

// M6: oportunidad → cotización desde el deal → aceptar → venta borrador
// y el deal aparece en la columna Ganado.
const unique = `m6-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("pipeline + cotizaciones end-to-end", () => {
  test("del deal a la venta pasando por la cotización", async ({ page }) => {
    // registro + org + cliente
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario M6");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    await openNav(page);
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page.getByRole("link", { name: /nuevo cliente/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Cliente Pipeline");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);

    // oportunidad
    await openNav(page);
    await page.getByRole("link", { name: /pipeline/i }).click();
    await page
      .getByPlaceholder(/título de la oportunidad/i)
      .fill("Pedido mensual");
    await page.getByRole("button", { name: /abrir oportunidad/i }).click();
    await expect(page.getByText("Pedido mensual")).toBeVisible();

    // cotización desde el deal
    await page.getByRole("link", { name: /crear cotización/i }).click();
    await page.waitForURL(/\/quotes\/new/);
    await page
      .getByLabel(/descripción/i)
      .first()
      .fill("Detergente mensual");
    await page
      .getByLabel(/^cant\.$/i)
      .first()
      .fill("20");
    await page
      .getByLabel(/^precio$/i)
      .first()
      .fill("100.00");
    await page.getByRole("button", { name: /guardar cotización/i }).click();
    await page.waitForURL(/\/quotes\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: /A-1/ })).toBeVisible();

    // aceptar → venta borrador
    await page.getByRole("button", { name: /aceptar/i }).click();
    await page.waitForURL(/\/sales\/[0-9a-f-]+$/);
    await expect(page.getByText(/borrador/i).first()).toBeVisible();
    await expect(page.getByText("Detergente mensual")).toBeVisible();

    // deal en Ganado
    await openNav(page);
    await page.getByRole("link", { name: /pipeline/i }).click();
    const wonColumn = page.locator("section", { hasText: "Ganado" });
    await expect(wonColumn.getByText("Pedido mensual")).toBeVisible();
  });
});
