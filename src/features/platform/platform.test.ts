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
import { buildCollectionsSummary, sendTelegramMessage } from "./notify";

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

  // venta confirmada con saldo (CxC) para el resumen
  const c = await createCustomer(db, orgA, USER, { name: "Deudor F6" });
  const s = await createSale(db, orgA, USER, {
    customerId: c.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "f6f6f6f6-0000-4000-8000-000000000001",
    items: [{ description: "d", qty: "1", unitPriceCents: 500_000n }],
  });
  await confirmSale(db, orgA, USER, s.id);
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
  it("arma el texto con las CxC y compromisos incumplidos", async () => {
    const text = await buildCollectionsSummary(db, orgA);
    expect(text).toContain("Deudor F6");
    expect(text).toContain("5000.00 CUP");
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
