import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";

/**
 * API keys de la API pública /api/v1. Solo se guarda el hash SHA-256;
 * la key completa (dsk_...) se muestra UNA vez al crearla.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(), // dsk_xxxx… para identificarla en la UI
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    index("api_keys_org_idx").on(t.orgId),
  ],
);

void sql; // (sin checks; el hash es opaco)
