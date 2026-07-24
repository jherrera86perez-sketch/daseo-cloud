// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale } from "@/features/sales/queries";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
} from "./queries";
import {
  buildCollectionsSummary,
  buildBirthdaySummary,
  logBirthdaysSent,
  sendTelegramMessage,
} from "./notify";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f6a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "f6b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });

  // venta confirmada con saldo (CxC), vencida hace 10 días — supera los
  // umbrales por defecto (7 días / $100) para aparecer en el resumen
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const c = await createCustomer(db, orgA, USER, { name: "Deudor F6" });
  const s = await createSale(db, orgA, USER, {
    customerId: c.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "f6f6f6f6-0000-4000-8000-000000000001",
    soldAt: tenDaysAgo,
    items: [{ description: "d", qty: "1", unitPriceCents: 500_000n }],
  });
  await confirmSale(db, orgA, USER, s.id);

  // venta reciente y de bajo monto — NO debe aparecer con los umbrales
  // por defecto (paridad ERP: cobranza_dias_min=7, cobranza_monto_min=$100)
  const c2 = await createCustomer(db, orgA, USER, { name: "Deudor Reciente" });
  const s2 = await createSale(db, orgA, USER, {
    customerId: c2.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "f6f6f6f6-0000-4000-8000-000000000002",
    items: [{ description: "d", qty: "1", unitPriceCents: 5_00n }],
  });
  await confirmSale(db, orgA, USER, s2.id);
});

describe("API keys", () => {
  let plainKey: string;
  let keyId: string;

  it("crear devuelve la key UNA vez y guarda solo el hash", async () => {
    const res = await createApiKey(db, orgA, USER, "Laika");
    plainKey = res.plainKey;
    keyId = res.row.id;
    expect(plainKey).toMatch(/^dsk_[A-Za-z0-9_-]{32,}$/);
    expect(res.row.keyHash).not.toContain(plainKey.slice(4));
    const list = await listApiKeys(db, orgA);
    expect(list).toHaveLength(1);
    expect(list[0].prefix).toBe(plainKey.slice(0, 12));
  });

  it("resolver una key válida devuelve la org; inválida devuelve null", async () => {
    const resolved = await resolveApiKey(db, plainKey);
    expect(resolved?.orgId).toBe(orgA);
    expect(
      await resolveApiKey(db, "dsk_invalida_xxxxxxxxxxxxxxxxxxxxxxxx"),
    ).toBeNull();
  });

  it("revocada deja de resolver", async () => {
    await revokeApiKey(db, orgA, USER, keyId);
    expect(await resolveApiKey(db, plainKey)).toBeNull();
  });

  it("aislamiento: otra org no revoca keys ajenas", async () => {
    const res = await createApiKey(db, orgA, USER, "Otra");
    await expect(revokeApiKey(db, orgB, USER, res.row.id)).rejects.toThrow();
  });
});

describe("resumen de cobranza (Telegram)", () => {
  it("arma el texto con las CxC que superan los umbrales por defecto (7 días / $100, paridad ERP)", async () => {
    const text = await buildCollectionsSummary(db, orgA);
    expect(text).toContain("Deudor F6");
    expect(text).toContain("5000.00 CUP");
    // reciente y de bajo monto: filtrada por los umbrales por defecto
    expect(text).not.toContain("Deudor Reciente");
  });

  it("umbrales configurables (dias_min/monto_min) del org", async () => {
    // dias_min=-1 deja pasar incluso una venta de hoy (dias_atraso=0)
    const text = await buildCollectionsSummary(db, orgA, {
      diasMin: -1,
      montoMinCents: 0n,
    });
    expect(text).toContain("Deudor Reciente");
  });

  it("envía vía la API de Telegram con el token de la org", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const ok = await sendTelegramMessage("123:token", "999", "hola");
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123:token/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
    fetchMock.mockRestore();
  });
});

describe("saludo de cumpleaños (Telegram, ≈ cumpleanios-cron.js del ERP)", () => {
  const HOY = new Date(Date.UTC(2026, 6, 24)); // fijo para el test: 24-jul

  it("arma el texto para clientes cuyo mes-día de nacimiento es hoy (cualquier año)", async () => {
    const c = await createCustomer(db, orgA, USER, {
      name: "Cumpleañero",
      birthDate: "1990-07-24",
    });
    const { text, customerIds } = await buildBirthdaySummary(db, orgA, HOY);
    expect(text).toContain("Cumpleañero");
    expect(text).toContain("🎂");
    expect(customerIds).toContain(c.id);
  });

  it("idempotencia: no repite el saludo el mismo año tras registrarlo", async () => {
    const c = await createCustomer(db, orgA, USER, {
      name: "Cumple Repetido",
      birthDate: "1985-07-24",
    });
    const first = await buildBirthdaySummary(db, orgA, HOY);
    expect(first.customerIds).toContain(c.id);
    await logBirthdaysSent(db, orgA, first.customerIds, HOY.getUTCFullYear());
    const second = await buildBirthdaySummary(db, orgA, HOY);
    expect(second.customerIds).not.toContain(c.id);
  });

  it("sin cumpleaños ese día devuelve texto null", async () => {
    const otroDia = new Date(Date.UTC(2026, 0, 1));
    const { text } = await buildBirthdaySummary(db, orgA, otroDia);
    expect(text).toBeNull();
  });

  it("aislamiento: no mezcla cumpleaños de otra org", async () => {
    const bCustomer = await createCustomer(db, orgB, USER, {
      name: "Cumple Org B",
      birthDate: "1990-07-24",
    });
    const a = await buildBirthdaySummary(db, orgA, HOY);
    expect(a.customerIds).not.toContain(bCustomer.id);
    const b = await buildBirthdaySummary(db, orgB, HOY);
    expect(b.customerIds).toContain(bCustomer.id);
  });
});
