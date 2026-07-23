import { and, asc, desc, eq } from "drizzle-orm";
import { statements, statementMovements } from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import {
  parseStatement,
  parseFecha,
  extractTelefono,
  type Resumen,
  type CuentaInfo,
} from "./parser";

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type StatementRow = typeof statements.$inferSelect;
export type StatementMovementRow = typeof statementMovements.$inferSelect;

const n2 = (v: number | null | undefined) =>
  v === null || v === undefined ? null : v.toFixed(2);

/**
 * Importa un estado de cuenta BPA (texto ya extraído del PDF con layout).
 * Réplica del POST /upload del ERP: 0 operaciones y duplicados lanzan
 * los MISMOS mensajes; dedup por triplete (cuenta_interna, fecha_inicio,
 * fecha_fin) dentro de la org.
 */
export async function uploadStatement(
  db: Db,
  orgId: string,
  userId: UserId,
  input: { rawText: string; filename?: string },
): Promise<{
  statement: StatementRow;
  resumen: Resumen;
  cuentaInfo: CuentaInfo;
  numOperaciones: number;
}> {
  const { operaciones, resumen, cuentaInfo } = parseStatement(input.rawText);

  if (operaciones.length === 0) {
    throw new Error(
      "No se encontraron operaciones en el PDF. Verifique que sea un estado de cuenta BPA.",
    );
  }

  if (
    cuentaInfo.cuentaInterna &&
    cuentaInfo.fechaInicio &&
    cuentaInfo.fechaFin
  ) {
    const [dup] = await db
      .select({ id: statements.id })
      .from(statements)
      .where(
        and(
          eq(statements.orgId, orgId),
          eq(statements.cuentaInterna, cuentaInfo.cuentaInterna),
          eq(statements.fechaInicio, cuentaInfo.fechaInicio),
          eq(statements.fechaFin, cuentaInfo.fechaFin),
        ),
      );
    if (dup) {
      throw new Error(`Este estado de cuenta ya fue importado (ID: ${dup.id})`);
    }
  }

  return db.transaction(async (tx: Db) => {
    const [statement] = await tx
      .insert(statements)
      .values({
        orgId,
        filename: input.filename || "estado.pdf",
        cuentaInterna: cuentaInfo.cuentaInterna ?? null,
        cuentaEstandarizada: cuentaInfo.cuentaEstandarizada ?? null,
        titular: cuentaInfo.titular ?? null,
        fechaInicio: cuentaInfo.fechaInicio ?? null,
        fechaFin: cuentaInfo.fechaFin ?? null,
        saldoInicial: n2(resumen.saldoInicial) ?? "0",
        saldoFinal: n2(resumen.saldoFinal),
        totalCreditos: n2(resumen.totalCreditos) ?? "0",
        totalDebitos: n2(resumen.totalDebitos) ?? "0",
        numOperaciones: resumen.totalOperaciones,
        cuadrado: resumen.validacion.cuadrado,
        validacionMensajes:
          resumen.validacion.mensajes.length > 0
            ? resumen.validacion.mensajes.join(" | ")
            : null,
      })
      .returning();

    let position = 0;
    for (const op of operaciones) {
      const { fechaIso, mes, anio } = parseFecha(op.fecha);
      await tx.insert(statementMovements).values({
        orgId,
        statementId: statement.id,
        position: position++,
        fecha: op.fecha || null,
        fechaIso,
        mes,
        anio,
        referencia: op.referencia,
        operacion: op.operacion,
        importe: n2(op.importe),
        saldo: n2(op.saldo),
        observacion: op.observacion || null,
        clientName: op.client_name,
        panOrigen: op.pan_origen,
        tipoTransaccion: op.tipo_transaccion,
        telefono: extractTelefono(op.observacion),
      });
    }

    await logAudit(tx, {
      orgId,
      userId,
      entity: "statement",
      entityId: statement.id,
      action: "create",
      after: {
        filename: statement.filename,
        ops: resumen.totalOperaciones,
        cuadrado: resumen.validacion.cuadrado,
      },
    });

    return {
      statement,
      resumen,
      cuentaInfo,
      numOperaciones: resumen.totalOperaciones,
    };
  });
}

/** Lista de importaciones (orden: más reciente primero, como el ERP). */
export async function listStatements(
  db: Db,
  orgId: string,
): Promise<StatementRow[]> {
  return db
    .select()
    .from(statements)
    .where(eq(statements.orgId, orgId))
    .orderBy(desc(statements.createdAt));
}

/** Detalle: cabecera + movimientos en el orden original del PDF. */
export async function getStatementDetail(
  db: Db,
  orgId: string,
  id: string,
): Promise<{ statement: StatementRow; movements: StatementMovementRow[] }> {
  const [statement] = await db
    .select()
    .from(statements)
    .where(eq(statements.id, id));
  if (!statement) throw new Error("Estado de cuenta no encontrado");
  assertOwnedByOrg(statement, orgId);
  const movements = await db
    .select()
    .from(statementMovements)
    .where(eq(statementMovements.statementId, id))
    .orderBy(asc(statementMovements.position));
  return { statement, movements };
}

/** Borrado con cascada de movimientos (FK ON DELETE CASCADE). */
export async function deleteStatement(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<{ movimientos: number }> {
  const { statement, movements } = await getStatementDetail(db, orgId, id);
  await db
    .delete(statements)
    .where(and(eq(statements.id, id), eq(statements.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "statement",
    entityId: id,
    action: "delete",
    after: { filename: statement.filename },
  });
  return { movimientos: movements.length };
}
