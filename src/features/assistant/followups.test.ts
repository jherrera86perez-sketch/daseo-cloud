// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { upsertFollowup, listFollowups, followupStats } from "./followups";

let db: TestDb;
let orgId: string;
let orgB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "Seguimiento", slug: "adseg" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
  const [b] = await db
    .insert(organizations)
    .values({ name: "Ajena", slug: "adsegb" })
    .returning();
  orgB = b.id;
});

describe("seguimiento de recomendaciones (asistente_seguimiento)", () => {
  it("UPSERT por recomendacion_id: crear y luego actualizar estado", async () => {
    const r1 = await upsertFollowup(db, orgId, USER, {
      recommendationId: "inv_abc",
      title: "Stock bajo: Jabón",
      category: "inventario",
    });
    expect(r1.message).toBe("Seguimiento actualizado");

    const list1 = await listFollowups(db, orgId);
    expect(list1).toHaveLength(1);
    expect(list1[0]).toMatchObject({
      recommendationId: "inv_abc",
      status: "PENDIENTE",
      completedAt: null,
    });

    // mismo id → actualiza, no duplica; COMPLETADA fija completada_at
    const r2 = await upsertFollowup(db, orgId, USER, {
      recommendationId: "inv_abc",
      title: "Stock bajo: Jabón",
      status: "COMPLETADA",
      notes: "comprado",
    });
    expect(r2.estado).toBe("COMPLETADA");
    const list2 = await listFollowups(db, orgId);
    expect(list2).toHaveLength(1);
    expect(list2[0].status).toBe("COMPLETADA");
    expect(list2[0].notes).toBe("comprado");
    expect(list2[0].completedAt).not.toBeNull();

    // reabrir limpia completada_at (excluded.completada_at del ERP)
    await upsertFollowup(db, orgId, USER, {
      recommendationId: "inv_abc",
      title: "Stock bajo: Jabón",
      status: "PENDIENTE",
    });
    const list3 = await listFollowups(db, orgId);
    expect(list3[0].completedAt).toBeNull();
  });

  it("valida campos requeridos con el mensaje literal", async () => {
    await expect(
      upsertFollowup(db, orgId, USER, { recommendationId: "", title: "x" }),
    ).rejects.toThrow("Faltan campos requeridos");
  });

  it("stats por estado y completadas del mes; filtro por estado", async () => {
    await upsertFollowup(db, orgId, USER, {
      recommendationId: "prod_merma",
      title: "Merma",
      status: "EN_PROGRESO",
    });
    await upsertFollowup(db, orgId, USER, {
      recommendationId: "precio_bajo_x",
      title: "Margen bajo",
      status: "COMPLETADA",
    });

    const stats = await followupStats(db, orgId);
    const porEstado = Object.fromEntries(
      stats.por_estado.map((s) => [s.estado, s.total]),
    );
    expect(porEstado["PENDIENTE"]).toBe(1);
    expect(porEstado["EN_PROGRESO"]).toBe(1);
    expect(porEstado["COMPLETADA"]).toBe(1);
    expect(stats.completadas_mes).toBe(1);

    const enProgreso = await listFollowups(db, orgId, "EN_PROGRESO");
    expect(enProgreso).toHaveLength(1);
    expect(enProgreso[0].recommendationId).toBe("prod_merma");
  });

  it("aislamiento multi-tenant: la org B no ve seguimientos ajenos", async () => {
    expect(await listFollowups(db, orgB)).toEqual([]);
    const stats = await followupStats(db, orgB);
    expect(stats.por_estado).toEqual([]);
    expect(stats.completadas_mes).toBe(0);
    // la misma recomendacion_id puede existir en otra org (unique POR org)
    await upsertFollowup(db, orgB, USER, {
      recommendationId: "inv_abc",
      title: "Otro",
    });
    expect(await listFollowups(db, orgB)).toHaveLength(1);
    expect(await listFollowups(db, orgId)).toHaveLength(3);
  });
});
