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

    // El logout vive en el menu de usuario del header desde la paridad visual
    await page.getByRole("button", { name: /menú de usuario/i }).click();
    await page.getByRole("button", { name: /cerrar sesión/i }).click();
    await page.waitForURL(/\/login/);

    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
  });

  /*
   * Regresión de "Explorar la demo deja al usuario en su propia organización",
   * observado en producción el 26/07 con una sesión real abierta.
   *
   * AVISO — esto NO es una barrera del `signOut()` que añadimos en onDemo:
   * comprobado por mutación, este test pasa igual con signOut y sin él, porque
   * en un contexto nuevo de Playwright el signIn sí reemplaza la sesión. El
   * fallo real no se logró reproducir aquí, así que el signOut es defensa
   * razonada, no arreglo verificado. Si alguien vuelve a ver la org equivocada,
   * el mecanismo sigue sin identificar: sospechas pendientes de descartar son
   * la caché del router de Next (payload RSC de /dashboard cacheado del usuario
   * anterior, que se arreglaría con router.refresh()) y algún estado de sesión
   * de larga vida que un contexto nuevo no tiene.
   *
   * Lo que sí cubre: que entrar a la demo no deje al usuario dentro de su org.
   */
  test("Explorar la demo cambia de organización aunque haya sesión abierta", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/correo/i).fill(EMAIL);
    await page.getByLabel(/contraseña/i).fill(PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText(new RegExp(ORG))).toBeVisible();

    await page.goto("/login");
    await page.getByRole("button", { name: /explorar la demo/i }).click();
    await page.waitForURL(/\/dashboard/);

    // Ya NO estamos en la org del usuario de este spec
    await expect(page.getByText(new RegExp(ORG))).toBeHidden();
  });
});
