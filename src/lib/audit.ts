import { auditLogs } from "@/db/schema";

type AnyDb = {
  insert: (table: typeof auditLogs) => {
    values: (v: typeof auditLogs.$inferInsert) => Promise<unknown>;
  };
};

export type AuditEntry = {
  orgId?: string | null;
  userId?: string | null;
  entity: string;
  entityId: string;
  action: "create" | "update" | "delete" | "cancel" | "auth";
  before?: unknown;
  after?: unknown;
};

/** Registra una acción en audit_logs. Llamar desde toda action de escritura. */
export async function logAudit(db: AnyDb, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    orgId: entry.orgId ?? null,
    userId: entry.userId ?? null,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
