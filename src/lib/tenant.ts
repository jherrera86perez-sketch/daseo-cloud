import { isNull, type Column } from "drizzle-orm";

/**
 * Convención de tenancy (verificada por la suite de aislamiento):
 * toda query de features/* recibe orgId y lo incluye en el WHERE; toda
 * referencia relacionada re-verifica pertenencia con assertOwnedByOrg.
 * (requireOrg() con sesión llega en M2 con Better Auth.)
 */

export class TenantViolationError extends Error {
  constructor(message = "El recurso no pertenece a la organización activa") {
    super(message);
    this.name = "TenantViolationError";
  }
}

/** Lanza si la fila no existe o pertenece a otra org. Devuelve la fila tipada. */
export function assertOwnedByOrg<T extends { orgId: string }>(
  row: T | undefined | null,
  orgId: string,
): T {
  if (!row || row.orgId !== orgId) {
    throw new TenantViolationError();
  }
  return row;
}

/** Filtro estándar de soft delete: `and(eq(t.orgId, orgId), notDeleted(t))`. */
export function notDeleted(table: { deletedAt: Column }) {
  return isNull(table.deletedAt);
}
