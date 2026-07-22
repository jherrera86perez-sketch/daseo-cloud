import { test, expect } from "@playwright/test";

// Flujo completo de auth contra la BD real (dev local: Neon; CI: secret).
// Email único por corrida para no chocar con datos previos.
const unique = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const EMAIL = `${unique}@daseo.test`;
const PASSWORD = "clave-e2e-super-segura-123";
const ORG = `E2E ${unique}`;

test.describe
  .serial("auth: registro → org → dashboard → logout → login", () => {
  test("registro y onboarding crean la organización", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario E2E");
    await page.getByLabel(/correo/i).fill(EMAIL);
    await page.getByLabel(/contraseña/i).fill(PASSWORD);
    await page.getByRole("button", { name: /registrarme/i }).click();

    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(ORG);
    await page.getByRole("button", { name: /crear organización/i }).click();

    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText(new RegExp(ORG))).toBeVisible();
  });

  test("logout y login vuelven al dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo/i).fill(EMAIL);
    await page.getByLabel(/contraseña/i).fill(PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.getByRole("button", { name: /cerrar sesión/i }).click();
    await page.waitForURL(/\/login/);

    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
  });
});
