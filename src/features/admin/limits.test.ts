// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, subscriptions } from "@/db/schema";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale } from "@/features/sales/queries";
import { getSubscription, setSubscription } from "./queries";
import { documentAllowance } from "./limits";

let db: TestDb;
let orgId: string;
let customerId: string;
const USER = null;

async function confirmedSale(key: string) {
  const s = await createSale(db, orgId, USER, {
    customerId,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: key,
    items: [{ description: "doc", qty: "1", unitPriceCents: 100n }],
  });
  await confirmSale(db, orgId, USER, s.id);
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "Limitada", slug: "f7lim" })
    .returning();
  orgId = org.id;
  const c = await createCustomer(db, orgId, USER, { name: "Cliente Lim" });
  customerId = c.id;
});

describe("límites del plan free (F7)", () => {
  it("trial vigente: ilimitado", async () => {
    await getSubscription(db, orgId); // aprovisiona trial de 14 días
    const a = await documentAllowance(db, orgId);
    expect(a.limited).toBe(false);
  });

  it("trial vencido: cuenta los docs del mes y corta en el tope", async () => {
    // vencer el trial a mano
    await db
      .update(subscriptions)
      .set({ trialEndsAt: new Date(Date.now() - 24 * 3600 * 1000) })
      .where(eq(subscriptions.orgId, orgId));

    await confirmedSale("f7f7f7f7-0000-4000-8000-000000000010");
    await confirmedSale("f7f7f7f7-0000-4000-8000-000000000011");

    const under = await documentAllowance(db, orgId, new Date(), 3);
    expect(under).toEqual({ limited: true, used: 2, max: 3, allowed: true });

    const at = await documentAllowance(db, orgId, new Date(), 2);
    expect(at).toEqual({ limited: true, used: 2, max: 2, allowed: false });
  });

  it("activar la org levanta el límite", async () => {
    await setSubscription(db, USER, orgId, { status: "active" });
    const a = await documentAllowance(db, orgId, new Date(), 1);
    expect(a.limited).toBe(false);
  });
});
