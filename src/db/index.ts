import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Cliente de producción (Neon serverless). Los tests NO usan esto:
 * usan PGlite en memoria vía src/test/db.ts.
 */
function createDb() {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL no configurada — crea la rama de Neon y añádela a .env.local",
    );
  }
  return drizzle(neon(env.DATABASE_URL), { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  _db ??= createDb();
  return _db;
}
