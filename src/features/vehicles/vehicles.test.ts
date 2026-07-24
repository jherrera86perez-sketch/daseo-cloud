// @vitest-environment node
// Paridad fiel con `vehicles`/`vehicle_tax_categories` del ERP CubaOne
// (docs/research/spec-resto-erp.md): registro simple del parque vehicular
// para el impuesto sobre el transporte terrestre (ONAT 071012, "La Chapa").
// Confirmado en el ERP real: es PURAMENTE INFORMATIVO — no genera ninguna
// obligación fiscal, solo se porta la suma anual mostrada en la UI.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations } from "@/db/schema";
import {
  createVehicle,
  updateVehicle,
  retireVehicle,
  listVehicles,
  totalAnnualVehicleTax,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "vha" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "vhb" })
    .returning();
  orgA = a.id;
  orgB = b.id;
});

describe("vehículos (CRUD + cuota anual informativa)", () => {
  it("crea, lista y actualiza un vehículo", async () => {
    const v = await createVehicle(db, orgA, USER, {
      plate: "P-001",
      brand: "Lada",
      model: "2107",
      categoryCode: "A_LIGERO",
    });
    expect(v.status).toBe("ACTIVE");
    const list = await listVehicles(db, orgA);
    expect(list.map((x) => x.plate)).toContain("P-001");

    const updated = await updateVehicle(db, orgA, USER, v.id, {
      plate: "P-001",
      brand: "Lada",
      model: "2107 (reparado)",
      categoryCode: "A_LIGERO",
    });
    expect(updated.model).toBe("2107 (reparado)");
  });

  it("suma la cuota anual SOLO de los vehículos activos (informativo, no genera obligación)", async () => {
    const org = await makeVehicleOrg();
    await createVehicle(db, org, USER, {
      plate: "T-100",
      categoryCode: "A_MOTO", // 110.00
    });
    const truck = await createVehicle(db, org, USER, {
      plate: "T-200",
      categoryCode: "B_CARGA_MEDIA", // 450.00
    });
    const total1 = await totalAnnualVehicleTax(db, org);
    expect(total1).toBe(56_000n); // 110.00 + 450.00

    // dar de baja (soft delete → SOLD) excluye del total, como el ERP
    await retireVehicle(db, org, USER, truck.id);
    const total2 = await totalAnnualVehicleTax(db, org);
    expect(total2).toBe(11_000n);
    const rows = await listVehicles(db, org);
    expect(rows.find((r) => r.id === truck.id)?.status).toBe("SOLD");
  });

  it("aislamiento multi-tenant: no mezcla vehículos de otra org", async () => {
    const created = await createVehicle(db, orgA, USER, {
      plate: "ISO-1",
      categoryCode: "A_PANEL",
    });
    const listB = await listVehicles(db, orgB);
    expect(listB.find((v) => v.plate === "ISO-1")).toBeUndefined();
    await expect(
      updateVehicle(db, orgB, USER, created.id, {
        plate: "ISO-1",
        categoryCode: "A_PANEL",
      }),
    ).rejects.toThrow();
  });

  it("placa única por org", async () => {
    const org = await makeVehicleOrg();
    await createVehicle(db, org, USER, {
      plate: "DUP-1",
      categoryCode: "A_MOTO",
    });
    await expect(
      createVehicle(db, org, USER, { plate: "DUP-1", categoryCode: "A_MOTO" }),
    ).rejects.toThrow();
  });
});

let counter = 0;
async function makeVehicleOrg(): Promise<string> {
  counter += 1;
  const [org] = await db
    .insert(organizations)
    .values({ name: `V${counter}`, slug: `vh-${counter}` })
    .returning();
  return org.id;
}
