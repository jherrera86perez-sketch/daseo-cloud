// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, customers, auditLogs } from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "./tenant";
import { logAudit } from "./audit";

let db: TestDb;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
});

describe("assertOwnedByOrg", () => {
  it("acepta filas de la propia org y rechaza las ajenas o inexistentes", async () => {
    const [c] = await db
      .insert(customers)
      .values({ orgId: orgA, name: "Cliente A" })
      .returning();
    expect(() => assertOwnedByOrg(c, orgA)).not.toThrow();
    expect(() => assertOwnedByOrg(c, orgB)).toThrow();
    expect(() => assertOwnedByOrg(undefined, orgA)).toThrow();
  });
});

describe("notDeleted", () => {
  it("filtra los soft-deleted", async () => {
    await db.insert(customers).values([
      { orgId: orgB, name: "Vivo" },
      { orgId: orgB, name: "Borrado", deletedAt: new Date() },
    ]);
    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgB), notDeleted(customers)));
    expect(rows.map((r) => r.name)).toEqual(["Vivo"]);
  });
});

describe("logAudit", () => {
  it("escribe la entrada con before/after", async () => {
    await logAudit(db, {
      orgId: orgA,
      entity: "customer",
      entityId: "c1",
      action: "update",
      before: { name: "x" },
      after: { name: "y" },
    });
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgA));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("update");
    expect(rows[0].before).toEqual({ name: "x" });
  });
});
