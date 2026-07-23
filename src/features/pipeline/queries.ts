import { and, asc, eq } from "drizzle-orm";
import { deals, pipelineStages, customers } from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type StageRow = typeof pipelineStages.$inferSelect;
export type DealRow = typeof deals.$inferSelect & { customerName?: string };

export async function listStagesWithDeals(
  db: Db,
  orgId: string,
): Promise<Array<{ stage: StageRow; deals: DealRow[] }>> {
  const stages: StageRow[] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.orgId, orgId))
    .orderBy(asc(pipelineStages.position));
  const rows = await db
    .select({ deal: deals, customerName: customers.name })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(eq(deals.orgId, orgId))
    .orderBy(asc(deals.position), asc(deals.createdAt));
  return stages.map((stage) => ({
    stage,
    deals: rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.deal.stageId === stage.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({ ...r.deal, customerName: r.customerName })),
  }));
}

export async function createDeal(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    customerId: string;
    title: string;
    amountCents: bigint;
    currency: string;
  },
): Promise<DealRow> {
  const [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, input.customerId), notDeleted(customers)));
  assertOwnedByOrg(cust, orgId);
  const [first] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.orgId, orgId))
    .orderBy(asc(pipelineStages.position))
    .limit(1);
  if (!first) {
    throw new Error("La organización no tiene etapas de pipeline");
  }
  const [row] = await db
    .insert(deals)
    .values({ ...input, orgId, stageId: first.id })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "deal",
    entityId: row.id,
    action: "create",
    after: { title: input.title },
  });
  return row;
}

/** Etapas nuevas entran justo antes de Ganado/Perdido (cierran el tablero). */
export async function createStage(
  db: Db,
  orgId: string,
  userId: UserId,
  name: string,
): Promise<StageRow> {
  const clean = name.trim();
  if (!clean) throw new Error("La etapa necesita un nombre");
  return db.transaction(async (tx: Db) => {
    const stages: StageRow[] = await tx
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.orgId, orgId))
      .orderBy(asc(pipelineStages.position));
    if (stages.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error("Ya existe una etapa con ese nombre");
    }
    const terminals = stages.filter((s) => s.isWon || s.isLost);
    const newPos = terminals.length
      ? Math.min(...terminals.map((s) => s.position))
      : stages.length
        ? Math.max(...stages.map((s) => s.position)) + 1
        : 1;
    // Desplazar en orden descendente: la position es única por org.
    const toShift = stages
      .filter((s) => s.position >= newPos)
      .sort((a, b) => b.position - a.position);
    for (const s of toShift) {
      await tx
        .update(pipelineStages)
        .set({ position: s.position + 1 })
        .where(eq(pipelineStages.id, s.id));
    }
    const [row] = await tx
      .insert(pipelineStages)
      .values({ orgId, name: clean, position: newPos })
      .returning();
    await logAudit(tx, {
      orgId,
      userId,
      entity: "pipeline_stage",
      entityId: row.id,
      action: "create",
      after: { name: clean },
    });
    return row;
  });
}

export async function renameStage(
  db: Db,
  orgId: string,
  userId: UserId,
  stageId: string,
  name: string,
): Promise<StageRow> {
  const clean = name.trim();
  if (!clean) throw new Error("La etapa necesita un nombre");
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId));
  assertOwnedByOrg(stage, orgId);
  const [row] = await db
    .update(pipelineStages)
    .set({ name: clean })
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "pipeline_stage",
    entityId: stageId,
    action: "update",
    after: { name: clean },
  });
  return row;
}

/** Solo se borran etapas vacías y no terminales (Ganado/Perdido son fijas). */
export async function deleteStage(
  db: Db,
  orgId: string,
  userId: UserId,
  stageId: string,
): Promise<void> {
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId));
  assertOwnedByOrg(stage, orgId);
  if (stage.isWon || stage.isLost) {
    throw new Error("Ganado y Perdido no se pueden borrar");
  }
  const [dealInStage] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.orgId, orgId), eq(deals.stageId, stageId)))
    .limit(1);
  if (dealInStage) {
    throw new Error("La etapa tiene oportunidades; muévelas primero");
  }
  await db
    .delete(pipelineStages)
    .where(
      and(eq(pipelineStages.id, stageId), eq(pipelineStages.orgId, orgId)),
    );
  await logAudit(db, {
    orgId,
    userId,
    entity: "pipeline_stage",
    entityId: stageId,
    action: "delete",
    after: { name: stage.name },
  });
}

/** Mueve el deal de etapa; Ganado/Perdido actualizan el status. */
export async function moveDeal(
  db: Db,
  orgId: string,
  userId: UserId,
  dealId: string,
  stageId: string,
): Promise<DealRow> {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  assertOwnedByOrg(deal, orgId);
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId));
  assertOwnedByOrg(stage, orgId);
  const status = stage.isWon ? "won" : stage.isLost ? "lost" : "open";
  const [updated] = await db
    .update(deals)
    .set({ stageId, status, updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "deal",
    entityId: dealId,
    action: "update",
    after: { stage: stage.name, status },
  });
  return updated;
}
