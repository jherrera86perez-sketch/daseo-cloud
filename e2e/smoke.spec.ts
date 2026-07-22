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
