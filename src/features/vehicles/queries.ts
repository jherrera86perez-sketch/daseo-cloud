import { and, eq } from "drizzle-orm";
import { vehicles } from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { categoryFeeCents } from "./constants";
import type { VehicleInput } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type VehicleRow = typeof vehicles.$inferSelect;

function toRow(input: VehicleInput) {
  const { acquisitionDate, ...rest } = input;
  return { ...rest, acquisitionDate: acquisitionDate || null };
}

export async function listVehicles(
  db: Db,
  orgId: string,
): Promise<VehicleRow[]> {
  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.orgId, orgId))
    .orderBy(vehicles.plate);
}

async function getOwnedVehicle(
  db: Db,
  orgId: string,
  id: string,
): Promise<VehicleRow> {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  return assertOwnedByOrg(row, orgId);
}

export async function createVehicle(
  db: Db,
  orgId: string,
  userId: UserId,
  input: VehicleInput,
): Promise<VehicleRow> {
  const [row] = await db
    .insert(vehicles)
    .values({ ...toRow(input), orgId })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "vehicle",
    entityId: row.id,
    action: "create",
    after: input,
  });
  return row;
}

export async function updateVehicle(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: VehicleInput,
): Promise<VehicleRow> {
  await getOwnedVehicle(db, orgId, id);
  const [row] = await db
    .update(vehicles)
    .set({ ...toRow(input), updatedAt: new Date() })
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "vehicle",
    entityId: id,
    action: "update",
    after: input,
  });
  return row;
}

/** ≈ DELETE /vehicles/:id del ERP: soft delete → status='SOLD'. */
export async function retireVehicle(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  await getOwnedVehicle(db, orgId, id);
  await db
    .update(vehicles)
    .set({ status: "SOLD", updatedAt: new Date() })
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "vehicle",
    entityId: id,
    action: "update",
    after: { status: "SOLD" },
  });
}

/**
 * ≈ suma client-side de PanelNegocio.tsx del ERP: total anual del impuesto
 * sobre el transporte terrestre de los vehículos ACTIVOS. Puramente
 * informativo — NO genera ninguna obligación fiscal (fiel al ERP real, que
 * tampoco lo hace).
 */
export async function totalAnnualVehicleTax(
  db: Db,
  orgId: string,
): Promise<bigint> {
  const rows = await db
    .select({ categoryCode: vehicles.categoryCode })
    .from(vehicles)
    .where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, "ACTIVE")));
  return rows.reduce(
    (acc: bigint, r: { categoryCode: string }) =>
      acc + categoryFeeCents(r.categoryCode),
    0n,
  );
}
