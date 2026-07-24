import { test, expect } from "@playwright/test";

// F6: generar API key en settings → consumir /api/v1 con ella → revocar → 401.
const unique = `f6-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe.serial("API pública end-to-end", () => {
  test("key creada en la UI autentica la API y revocada deja de servir", async ({
    page,
    request,
  }) => {
    await page.goto("/signup");
    await page.getByLabel(/nombre/i).fill("Usuario F6");
    await page.getByLabel(/correo/i).fill(`${unique}@daseo.test`);
    await page.getByLabel(/contraseña/i).fill("clave-e2e-super-segura-123");
    await page.getByRole("button", { name: /registrarme/i }).click();
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/nombre del negocio/i).fill(`Org ${unique}`);
    await page.getByRole("button", { name: /crear organización/i }).click();
    await page.waitForURL(/\/dashboard/);

    // cliente para que la API tenga algo que devolver
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page.getByRole("link", { name: /nuevo cliente/i }).click();
    await page.getByLabel(/nombre \*/i).fill("Cliente API");
    await page.getByRole("button", { name: /guardar/i }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);

    // generar API key
    await page.getByRole("link", { name: /configuración/i }).click();
    await page.getByPlaceholder(/laika/i).fill("Bot E2E");
    await page.getByRole("button", { name: /generar key/i }).click();
    const keyEl = page.locator("code", { hasText: /^dsk_/ });
    await expect(keyEl).toBeVisible();
    const plainKey = (await keyEl.textContent())!.trim();

    // sin key → 401 · con key → clientes de la org
    const unauth = await request.get("/api/v1/customers");
    expect(unauth.status()).toBe(401);
    const authed = await request.get("/api/v1/customers", {
      headers: { authorization: `Bearer ${plainKey}` },
    });
    expect(authed.status()).toBe(200);
    const body = await authed.json();
    expect(body.customers.map((c: { name: string }) => c.name)).toContain(
      "Cliente API",
    );

    // summary también responde
    const summary = await request.get("/api/v1/summary", {
      headers: { authorization: `Bearer ${plainKey}` },
    });
    expect(summary.status()).toBe(200);

    // revocar → 401
    await page.getByRole("button", { name: /revocar/i }).click();
    await expect(page.getByText(/key revocada/i)).toBeVisible();
    const revoked = await request.get("/api/v1/customers", {
      headers: { authorization: `Bearer ${plainKey}` },
    });
    expect(revoked.status()).toBe(401);

    // Telegram: umbrales de cobranza (paridad ERP cobranza_dias_min/monto_min)
    // se guardan junto al token/chat en el mismo notify_settings
    const tgForm = page
      .locator("form")
      .filter({ has: page.getByPlaceholder(/token del bot/i) });
    await tgForm.getByPlaceholder(/token del bot/i).fill("123456:e2e-fake");
    await tgForm.getByPlaceholder(/chat id/i).fill("-100999");
    await tgForm.getByPlaceholder("7").fill("10");
    await tgForm.getByPlaceholder("100.00").fill("50.00");
    await tgForm.getByRole("button", { name: /^guardar$/i }).click();
    await expect(page.getByText(/configuración guardada/i)).toBeVisible();
    await page.reload();
    const tgFormReloaded = page
      .locator("form")
      .filter({ has: page.getByPlaceholder(/token del bot/i) });
    await expect(tgFormReloaded.getByPlaceholder("7")).toHaveValue("10");
    await expect(tgFormReloaded.getByPlaceholder("100.00")).toHaveValue(
      "50.00",
    );
  });
});
