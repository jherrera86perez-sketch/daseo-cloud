import { test, expect } from "@playwright/test";

test.describe("smoke i18n", () => {
  test("/ sirve la landing en español", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(
      page.getByRole("heading", { name: "Daseo Cloud" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Comenzar" })).toBeVisible();
  });

  test("/pt sirve la landing en portugués", async ({ page }) => {
    await page.goto("/pt");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(page.getByRole("link", { name: "Começar" })).toBeVisible();
  });
});

/*
 * Estos dos casos existen porque los de arriba no bastaron: comprobaban que el
 * botón estuviera VISIBLE, y el botón lo estaba — apuntando a "/". La landing
 * enlazaba a sí misma, así que desde la portada no se podía llegar al login ni
 * a la demo. Un enlace se prueba siguiéndolo, no viéndolo.
 */
test.describe("la portada deja entrar", () => {
  test("Comenzar lleva al login en español", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Comenzar" }).click();
    await page.waitForURL(/\/login/);
    await expect(
      page.getByRole("button", { name: /explorar la demo/i }),
    ).toBeVisible();
  });

  test("Começar lleva al login en portugués", async ({ page }) => {
    await page.goto("/pt");
    await page.getByRole("link", { name: "Começar" }).click();
    await page.waitForURL(/\/login/);
  });
});
