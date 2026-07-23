import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { raffles, statementMovements } from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type RaffleRow = typeof raffles.$inferSelect;

export type Participante = {
  client_name: string;
  pan_origen: string | null;
  telefono: string | null;
  num_ops: number;
  total_creditos: number;
  primera_op: string | null;
  ultima_op: string | null;
};

/**
 * Participantes del sorteo — query EXACTA del ERP (GET /sorteos/participantes):
 * clientes con transferencias ENTRANTES (CR) del mes, agrupados por
 * (client_name, pan_origen). Sin mínimos: 1 transferencia basta.
 */
export async function raffleParticipants(
  db: Db,
  orgId: string,
  anio: number,
  mes: number,
): Promise<Participante[]> {
  return db
    .select({
      client_name: statementMovements.clientName,
      pan_origen: statementMovements.panOrigen,
      telefono: sql<string | null>`max(${statementMovements.telefono})`,
      num_ops: sql<number>`count(*)`.mapWith(Number),
      total_creditos: sql<number>`sum(${statementMovements.importe})`.mapWith(
        Number,
      ),
      primera_op: sql<string | null>`min(${statementMovements.fechaIso})::text`,
      ultima_op: sql<string | null>`max(${statementMovements.fechaIso})::text`,
    })
    .from(statementMovements)
    .where(
      and(
        eq(statementMovements.orgId, orgId),
        eq(statementMovements.anio, anio),
        eq(statementMovements.mes, mes),
        isNotNull(statementMovements.clientName),
        ne(statementMovements.clientName, ""),
        eq(statementMovements.operacion, "CR"),
      ),
    )
    .groupBy(statementMovements.clientName, statementMovements.panOrigen)
    .orderBy(desc(sql`sum(${statementMovements.importe})`));
}

/**
 * Registra al ganador (POST /sorteos del ERP): el ganador ya viene elegido
 * por el frontend (azar uniforme). Sin chequeo de duplicados por mes (fiel).
 */
export async function createRaffle(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    nombre?: string;
    mes: number;
    anio: number;
    ganadorClientName: string;
    ganadorPan?: string | null;
    ganadorTelefono?: string | null;
    ganadorNumOps?: number;
    ganadorTotalCreditos?: number;
    numParticipantes?: number;
  },
): Promise<RaffleRow> {
  if (!input.ganadorClientName || !input.mes || !input.anio) {
    throw new Error("Se requiere ganador, mes y anio");
  }
  const [row] = await db
    .insert(raffles)
    .values({
      orgId,
      nombre: input.nombre || `Sorteo ${input.mes}/${input.anio}`,
      mes: input.mes,
      anio: input.anio,
      numParticipantes: input.numParticipantes ?? 0,
      ganadorClientName: input.ganadorClientName,
      ganadorPan: input.ganadorPan ?? null,
      ganadorTelefono: input.ganadorTelefono ?? null,
      ganadorNumOps: input.ganadorNumOps ?? 0,
      ganadorTotalCreditos: (input.ganadorTotalCreditos ?? 0).toFixed(2),
    })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "raffle",
    entityId: row.id,
    action: "create",
    after: {
      ganador: input.ganadorClientName,
      mes: input.mes,
      anio: input.anio,
    },
  });
  return row;
}

/** Historial (GET /sorteos): más reciente primero. */
export async function listRaffles(db: Db, orgId: string): Promise<RaffleRow[]> {
  return db
    .select()
    .from(raffles)
    .where(eq(raffles.orgId, orgId))
    .orderBy(desc(raffles.fechaSorteo));
}

export async function deleteRaffle(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  const [row] = await db.select().from(raffles).where(eq(raffles.id, id));
  assertOwnedByOrg(row, orgId);
  await db
    .delete(raffles)
    .where(and(eq(raffles.id, id), eq(raffles.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "raffle",
    entityId: id,
    action: "delete",
    after: { ganador: row.ganadorClientName },
  });
}
