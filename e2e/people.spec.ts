import { test, expect } from "@playwright/test";
import { openNav } from "./nav";

// F5: empleado → nómina alimenta fiscal · compromiso → alerta en dashboard →
// venta lo cumple · auditoría visible.
const unique = `f5-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("personas y análisis end-to-end", () => {
  test("empleados, compromisos y auditoría", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario F5");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // empleado con salario
    await openNav(page);
    await page.getByRole("link", { name: /empleados/i }).click();
    await page.getByPlaceholder(/^nombre$/i).fill("Obrero E2E");
    await page.getByPlaceholder(/salario/i).fill("5000.00");
    await page.getByRole("button", { name: /^agregar$/i }).click();
    // rol cell: el nombre también existe como <option> oculta en el form de
    // observación del día (details colapsado)
    await expect(page.getByRole("cell", { name: "Obrero E2E" })).toBeVisible();
    await expect(page.getByText(/nómina activa/i)).toBeVisible();

    // cliente + compromiso semanal
    await openNav(page);
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page.getByRole("link", { name: /nuevo cliente/i }).click();
    await page.getByLabel(/nombre \*/i).fill("J-Carlos E2E");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);
    await page.getByPlaceholder(/detergente semanales/i).fill("20 L semanales");
    await page.getByRole("button", { name: /crear compromiso/i }).click();
    await expect(page.getByText(/pendiente este período/i)).toBeVisible();

    // dashboard alerta el compromiso
    await openNav(page);
    await page.getByRole("link", { name: /panel/i }).click();
    await expect(
      page.getByText(/1 compromiso\(s\) sin cumplir/i),
    ).toBeVisible();

    // venta al cliente → cumplido
    await openNav(page);
    await page.getByRole("link", { name: /^ventas$/i }).click();
    await page.getByRole("link", { name: /nueva venta/i }).click();
    await page
      .getByLabel(/descripción/i)
      .first()
      .fill("Detergente semanal");
    await page
      .getByLabel(/^cant\.$/i)
      .first()
      .fill("20");
    await page
      .getByLabel(/^precio$/i)
      .first()
      .fill("100.00");
    await page.getByRole("button", { name: /guardar borrador/i }).click();
    await page.waitForURL(/\/sales\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: /confirmar venta/i }).click();
    await expect(page.getByRole("heading", { name: /A-1/ })).toBeVisible({
      timeout: 20_000,
    });

    await openNav(page);
    await page.getByRole("link", { name: /panel/i }).click();
    await expect(page.getByText(/compromiso\(s\) sin cumplir/i)).toBeHidden();
    await expect(page.getByText(/top clientes/i)).toBeVisible();
    await expect(page.getByText("J-Carlos E2E").first()).toBeVisible();

    // auditoría registra lo hecho
    await openNav(page);
    await page.getByRole("link", { name: /auditoría/i }).click();
    await expect(page.getByText("employee").first()).toBeVisible();
    await expect(page.getByText("sale").first()).toBeVisible();
  });
});
