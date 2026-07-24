// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import {
  organizations,
  orgSettings,
  products,
  recipes,
  productionOrders,
  productionLabor,
} from "@/db/schema";
import {
  createEmployee,
  addDayObservation,
  listDayEvaluations,
  deleteDayEvaluation,
  evaluacionAuto,
} from "./queries";

let db: TestDb;
let orgId: string;
let orgB: string;
let empId: string;
const USER = null;

const DAY = 24 * 60 * 60 * 1000;
const hoy = new Date().toISOString().slice(0, 10);
const ayer = new Date(Date.now() - DAY).toISOString().slice(0, 10);

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "Obs", slug: "adobs" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
  const [b] = await db
    .insert(organizations)
    .values({ name: "Ajena", slug: "adobsb" })
    .returning();
  orgB = b.id;

  const e = await createEmployee(db, orgId, USER, {
    name: "Naydit",
    role: "Operaria",
    salaryCents: 5000_00n,
  });
  empId = e.id;

  // Producción con mano de obra ayer: 2 órdenes, 1h y 0.5h @ $20/h
  const [prod] = await db
    .insert(products)
    .values({ orgId, name: "Detergente", unit: "L", isProducible: true })
    .returning();
  const [recipe] = await db
    .insert(recipes)
    .values({ orgId, productId: prod.id, name: "R", outputQty: "10" })
    .returning();
  for (const hours of ["1.00", "0.50"]) {
    const [o] = await db
      .insert(productionOrders)
      .values({
        orgId,
        recipeId: recipe.id,
        productId: prod.id,
        status: "confirmed",
        producedQty: "10",
        wasteQty: "1",
        createdAt: new Date(Date.now() - DAY),
      })
      .returning();
    await db.insert(productionLabor).values({
      orgId,
      orderId: o.id,
      employeeId: empId,
      hours,
      costHourCents: 20_00n,
    });
  }
});

describe("observaciones diarias de empleados (empleado_evaluaciones ricas)", () => {
  it("crea y luego actualiza por (empleado, fecha) — UPSERT del ERP", async () => {
    const r1 = await addDayObservation(db, orgId, USER, {
      employeeId: empId,
      fecha: hoy,
      mermaProducida: "2.5",
      defectos: 1,
    });
    expect(r1.message).toBe("Observación creada");

    // mismo día: actualiza solo los campos presentes (COALESCE del ERP)
    const r2 = await addDayObservation(db, orgId, USER, {
      employeeId: empId,
      fecha: hoy,
      notas: "revisar balanza",
    });
    expect(r2.message).toBe("Observación actualizada");
    expect(r2.id).toBe(r1.id);

    const list = await listDayEvaluations(db, orgId, empId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      defects: 1,
      notes: "revisar balanza",
    });
    expect(Number(list[0].wasteProduced)).toBeCloseTo(2.5, 3);
  });

  it("evaluacionAuto combina producción real por día con observaciones", async () => {
    await addDayObservation(db, orgId, USER, {
      employeeId: empId,
      fecha: ayer,
      defectos: 3,
    });
    const r = await evaluacionAuto(db, orgId, empId, {});
    expect(r.empleado.id).toBe(empId);
    // ayer: producción + observación fusionadas; hoy: solo observación
    expect(r.dias).toHaveLength(2);
    const [diaHoy, diaAyer] = r.dias;
    expect(diaHoy.fecha).toBe(hoy);
    expect(diaHoy.es_solo_observacion).toBe(true);
    expect(diaAyer.fecha).toBe(ayer);
    expect(diaAyer.ordenes).toBe(2);
    expect(diaAyer.horas).toBeCloseTo(1.5, 3);
    expect(diaAyer.devengado).toBeCloseTo(30, 2); // 1.5h × $20
    expect(diaAyer.unidades).toBeCloseTo(18, 3); // 2×(10−1)
    expect(diaAyer.defectos).toBe(3);
    expect(diaAyer.es_solo_observacion).toBe(false);

    expect(r.totales).toMatchObject({
      ordenes: 2,
      dias_trabajados: 2,
      defectos_total: 4,
    });
    expect(r.totales.devengado).toBeCloseTo(30, 2);
    // merma: 2 órdenes ×1 + observadas 2.5 = 4.5
    expect(r.totales.merma_total).toBeCloseTo(4.5, 3);
  });

  it("empleado inexistente lanza el mensaje literal", async () => {
    await expect(
      evaluacionAuto(db, orgId, "00000000-0000-4000-8000-000000000099", {}),
    ).rejects.toThrow("Empleado no encontrado");
  });

  it("aislamiento: la org B no ve ni puede observar al empleado", async () => {
    await expect(
      addDayObservation(db, orgB, USER, { employeeId: empId, fecha: hoy }),
    ).rejects.toThrow();
    expect(await listDayEvaluations(db, orgB, empId)).toEqual([]);
  });

  it("elimina una observación", async () => {
    const list = await listDayEvaluations(db, orgId, empId);
    const target = list.find((l) => l.date === hoy)!;
    const r = await deleteDayEvaluation(db, orgId, USER, target.id);
    expect(r.message).toBe("Evaluación eliminada");
    await expect(
      deleteDayEvaluation(db, orgId, USER, target.id),
    ).rejects.toThrow("Evaluación no encontrada");
  });
});
