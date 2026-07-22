// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import {
  organizations,
  customers,
  products,
  exchangeRates,
  auditLogs,
  pipelineStages,
  documentSequences,
} from "./schema";

let db: TestDb;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "Daseo", slug: "daseo", baseCurrency: "CUP" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "Otro Negocio", slug: "otro", baseCurrency: "BRL" })
    .returning();
  orgA = a.id;
  orgB = b.id;
});

describe("migraciones y esquema", () => {
  it("crea las organizaciones con uuid y timestamps", async () => {
    const rows = await db.select().from(organizations);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });
});

describe("aislamiento multi-tenant", () => {
  it("las queries con scope de org solo devuelven datos de esa org", async () => {
    await db.insert(customers).values([
      { orgId: orgA, name: "Cliente de A" },
      { orgId: orgB, name: "Cliente de B" },
    ]);
    const deA = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgA), isNull(customers.deletedAt)));
    expect(deA).toHaveLength(1);
    expect(deA[0].name).toBe("Cliente de A");
  });

  it("permite el mismo SKU en orgs distintas pero no duplicado en la misma", async () => {
    await db
      .insert(products)
      .values({ orgId: orgA, name: "Detergente", sku: "DET-1", unit: "L" });
    await db
      .insert(products)
      .values({ orgId: orgB, name: "Outro", sku: "DET-1", unit: "L" });
    await expect(
      db
        .insert(products)
        .values({ orgId: orgA, name: "Copia", sku: "DET-1", unit: "L" }),
    ).rejects.toThrow();
  });
});

describe("CHECK constraints (defensa en profundidad)", () => {
  it("rechaza precios negativos", async () => {
    await expect(
      db.insert(products).values({
        orgId: orgA,
        name: "Inválido",
        unit: "unit",
        priceCents: -100n,
      }),
    ).rejects.toThrow();
  });

  it("rechaza tasas de cambio no positivas", async () => {
    await expect(
      db.insert(exchangeRates).values({
        orgId: orgA,
        currency: "USD",
        rateToBase: "0",
      }),
    ).rejects.toThrow();
  });
});

describe("infraestructura core", () => {
  it("registra auditoría con before/after jsonb", async () => {
    const [row] = await db
      .insert(auditLogs)
      .values({
        orgId: orgA,
        entity: "customer",
        entityId: "x",
        action: "create",
        after: { name: "Cliente de A" },
      })
      .returning();
    expect(row.after).toEqual({ name: "Cliente de A" });
  });

  it("acepta etapas de pipeline y secuencias por org/tipo/serie/año", async () => {
    await db
      .insert(pipelineStages)
      .values({ orgId: orgA, name: "Prospecto", position: 1 });
    await db.insert(documentSequences).values({
      orgId: orgA,
      docType: "sale",
      series: "A",
      year: 2026,
      nextNumber: 1,
    });
    await expect(
      db.insert(documentSequences).values({
        orgId: orgA,
        docType: "sale",
        series: "A",
        year: 2026,
        nextNumber: 9,
      }),
    ).rejects.toThrow();
  });
});
