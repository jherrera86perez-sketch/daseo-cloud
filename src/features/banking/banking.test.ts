// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale, addPayment } from "@/features/sales/queries";
import {
  createBankAccount,
  listBankAccounts,
  importMovements,
  listMovements,
  matchSuggestions,
  linkMovement,
  ignoreMovement,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let accountId: string;
let paymentId: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f3a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "f3b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });

  // venta confirmada con cobro por transferencia de 8000.00 CUP
  const customer = await createCustomer(db, orgA, USER, {
    name: "Bodega El Sol",
  });
  const sale = await createSale(db, orgA, USER, {
    customerId: customer.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "f3f3f3f3-0000-4000-8000-000000000001",
    items: [{ description: "d", qty: "1", unitPriceCents: 800000n }],
  });
  await confirmSale(db, orgA, USER, sale.id);
  const pay = await addPayment(db, orgA, USER, sale.id, {
    amountCents: 800000n,
    currency: "CUP",
    rateFixed: "1",
    appliedCents: 800000n,
    method: "transfer",
  });
  paymentId = pay.id;
});

describe("cuentas bancarias", () => {
  it("crea y lista", async () => {
    const acc = await createBankAccount(db, orgA, USER, {
      name: "Banco Metropolitano CUP",
      currency: "CUP",
    });
    accountId = acc.id;
    const list = await listBankAccounts(db, orgA);
    expect(list.map((x) => x.name)).toEqual(["Banco Metropolitano CUP"]);
  });
});

describe("importación con dedup", () => {
  const rows = [
    {
      date: "2026-07-15",
      description: "TRANSFERENCIA BODEGA EL SOL",
      amountCents: 800000n,
      reference: "TRF-001",
    },
    {
      date: "2026-07-16",
      description: "COMISION",
      amountCents: -2550n,
    },
  ];

  it("importa filas nuevas", async () => {
    const res = await importMovements(db, orgA, USER, accountId, rows);
    expect(res.inserted).toBe(2);
    expect(res.duplicates).toBe(0);
  });

  it("reimportar el mismo archivo no duplica", async () => {
    const res = await importMovements(db, orgA, USER, accountId, rows);
    expect(res.inserted).toBe(0);
    expect(res.duplicates).toBe(2);
    const movs = await listMovements(db, orgA, accountId);
    expect(movs).toHaveLength(2);
  });
});

describe("conciliación", () => {
  it("sugiere el cobro con monto exacto y método transferencia", async () => {
    const movs = await listMovements(db, orgA, accountId);
    const income = movs.find((m) => m.amountCents > 0n)!;
    const suggestions = await matchSuggestions(db, orgA, income.id);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].paymentId).toBe(paymentId);
    expect(suggestions[0].score).toBeGreaterThanOrEqual(2);
  });

  it("vincular marca ambos lados", async () => {
    const movs = await listMovements(db, orgA, accountId);
    const income = movs.find((m) => m.amountCents > 0n)!;
    await linkMovement(db, orgA, USER, income.id, { paymentId });
    const after = await listMovements(db, orgA, accountId);
    const linked = after.find((m) => m.id === income.id)!;
    expect(linked.status).toBe("matched");
    expect(linked.matchedPaymentId).toBe(paymentId);
  });

  it("ignorar deja el movimiento fuera de pendientes", async () => {
    const movs = await listMovements(db, orgA, accountId);
    const fee = movs.find((m) => m.amountCents < 0n)!;
    await ignoreMovement(db, orgA, USER, fee.id);
    const after = await listMovements(db, orgA, accountId);
    expect(after.find((m) => m.id === fee.id)?.status).toBe("ignored");
  });

  it("aislamiento: otra org no ve la cuenta ni vincula", async () => {
    const movs = await listMovements(db, orgA, accountId);
    await expect(listMovements(db, orgB, accountId)).rejects.toThrow();
    await expect(
      linkMovement(db, orgB, USER, movs[0].id, { paymentId }),
    ).rejects.toThrow();
  });
});
