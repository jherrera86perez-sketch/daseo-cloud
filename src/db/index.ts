import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Cliente de producción: driver WebSocket de Neon (Pool), NO neon-http —
 * el kardex y la numeración documental usan transacciones con FOR UPDATE
 * y neon-http no soporta transacciones. Los tests usan PGlite (src/test/db).
 */
neonConfig.webSocketConstructor = ws;

function createDb() {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL no configurada — crea la rama de Neon y añádela a .env.local",
    );
  }
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return drizzle(pool, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  _db ??= createDb();
  return _db;
}
