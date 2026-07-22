import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { apiKeys } from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type ApiKeyRow = typeof apiKeys.$inferSelect;

function hashKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/** Genera dsk_<base64url>. La key completa solo existe en el retorno. */
export async function createApiKey(
  db: Db,
  orgId: string,
  userId: UserId,
  name: string,
): Promise<{ row: ApiKeyRow; plainKey: string }> {
  const plainKey = `dsk_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      orgId,
      name,
      prefix: plainKey.slice(0, 12),
      keyHash: hashKey(plainKey),
    })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "api_key",
    entityId: row.id,
    action: "create",
    after: { name, prefix: row.prefix },
  });
  return { row, plainKey };
}

export async function listApiKeys(db: Db, orgId: string): Promise<ApiKeyRow[]> {
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
  assertOwnedByOrg(row, orgId);
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(apiKeys.id, id));
  await logAudit(db, {
    orgId,
    userId,
    entity: "api_key",
    entityId: id,
    action: "delete",
    after: { revoked: true },
  });
}

/** Resuelve una key a su org (null si no existe o está revocada). */
export async function resolveApiKey(
  db: Db,
  plainKey: string,
): Promise<{ orgId: string; keyId: string } | null> {
  if (!plainKey.startsWith("dsk_")) return null;
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(eq(apiKeys.keyHash, hashKey(plainKey)), isNull(apiKeys.revokedAt)),
    );
  if (!row) return null;
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));
  return { orgId: row.orgId, keyId: row.id };
}
