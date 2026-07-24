import { and, desc, eq, gte, sql } from "drizzle-orm";
import { assistantFollowups } from "@/db/schema";
import { logAudit } from "@/lib/audit";

/**
 * Seguimiento de recomendaciones del asistente (≈ asistente_seguimiento del
 * ERP): UPSERT por recomendacion_id, listado y estadísticas. Los mensajes son
 * los literales del ERP (asistente.routes.js).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export const ESTADOS_SEGUIMIENTO = [
  "PENDIENTE",
  "EN_PROGRESO",
  "COMPLETADA",
  "DESCARTADA",
] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

export type FollowupRow = typeof assistantFollowups.$inferSelect;

export type FollowupInput = {
  recommendationId: string;
  title: string;
  category?: string;
  status?: EstadoSeguimiento;
  notes?: string;
};

export async function upsertFollowup(
  db: Db,
  orgId: string,
  userId: UserId,
  input: FollowupInput,
): Promise<{ message: string; estado: EstadoSeguimiento; id: string }> {
  if (!input.recommendationId || !input.title) {
    throw new Error("Faltan campos requeridos");
  }
  const estado = input.status || "PENDIENTE";
  const ahora = new Date();
  const completadaAt = estado === "COMPLETADA" ? ahora : null;

  const [row] = await db
    .insert(assistantFollowups)
    .values({
      orgId,
      recommendationId: input.recommendationId,
      title: input.title,
      category: input.category ?? null,
      status: estado,
      notes: input.notes ?? null,
      userId,
      completedAt: completadaAt,
    })
    .onConflictDoUpdate({
      target: [assistantFollowups.orgId, assistantFollowups.recommendationId],
      set: {
        status: estado,
        notes: input.notes ?? null,
        userId,
        updatedAt: ahora,
        completedAt: completadaAt,
      },
    })
    .returning();

  await logAudit(db, {
    orgId,
    userId,
    entity: "assistant_followup",
    entityId: row.id,
    action: "update",
    after: { recommendationId: input.recommendationId, estado },
  });
  return { message: "Seguimiento actualizado", estado, id: row.id };
}

export async function listFollowups(
  db: Db,
  orgId: string,
  estado?: EstadoSeguimiento,
): Promise<FollowupRow[]> {
  const where = [eq(assistantFollowups.orgId, orgId)];
  if (estado) where.push(eq(assistantFollowups.status, estado));
  return db
    .select()
    .from(assistantFollowups)
    .where(and(...where))
    .orderBy(desc(assistantFollowups.updatedAt))
    .limit(100);
}

export type FollowupStats = {
  por_estado: Array<{ estado: string; total: number }>;
  completadas_mes: number;
};

export async function followupStats(
  db: Db,
  orgId: string,
): Promise<FollowupStats> {
  const porEstado = await db
    .select({
      estado: assistantFollowups.status,
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(assistantFollowups)
    .where(eq(assistantFollowups.orgId, orgId))
    .groupBy(assistantFollowups.status);

  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [completadas] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(assistantFollowups)
    .where(
      and(
        eq(assistantFollowups.orgId, orgId),
        eq(assistantFollowups.status, "COMPLETADA"),
        gte(assistantFollowups.completedAt, hace30),
      ),
    );

  return {
    por_estado: porEstado,
    completadas_mes: completadas?.total || 0,
  };
}
