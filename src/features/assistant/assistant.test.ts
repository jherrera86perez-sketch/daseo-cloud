// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings, pipelineStages } from "@/db/schema";
import { DEFAULT_STAGES } from "@/lib/auth";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale } from "@/features/sales/queries";
import { assistantAlerts } from "./queries";

let db: TestDb;
let orgId: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "Asistida", slug: "f5asist" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({
    orgId,
    baseCurrency: "CUP",
    notifySettings: { salesGoalBase: "10000", overdueLimitBase: "50" },
  });
  await db
    .insert(pipelineStages)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId })));

  // venta confirmada de 80.00 CUP, vencida ayer y sin cobrar
  const c = await createCustomer(db, orgId, USER, { name: "Moroso" });
  const s = await createSale(db, orgId, USER, {
    customerId: c.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "f5f5f5f5-0000-4000-8000-000000000001",
    dueDate: new Date(Date.now() - 24 * 3600 * 1000),
    items: [{ description: "d", qty: "1", unitPriceCents: 80_00n }],
  });
  await confirmSale(db, orgId, USER, s.id);
});

describe("asistente directivo (F5)", () => {
  it("dispara ventas-bajo-meta y CxC vencida sobre el tope", async () => {
    const alerts = await assistantAlerts(db, orgId);
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain("sales-below-goal");
    expect(kinds).toContain("overdue-limit");
    const goal = alerts.find((a) => a.kind === "sales-below-goal")!;
    expect(goal).toMatchObject({
      actualBaseCents: 80_00n,
      goalBaseCents: 10000_00n,
    });
    const overdue = alerts.find((a) => a.kind === "overdue-limit")!;
    expect(overdue).toMatchObject({
      overdueBaseCents: 80_00n,
      limitBaseCents: 50_00n,
    });
  });

  it("sin umbrales configurados, esos KPIs no alertan", async () => {
    await db
      .update(orgSettings)
      .set({ notifySettings: {} })
      .where(eq(orgSettings.orgId, orgId));
    const alerts = await assistantAlerts(db, orgId);
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).not.toContain("sales-below-goal");
    expect(kinds).not.toContain("overdue-limit");
  });
});
