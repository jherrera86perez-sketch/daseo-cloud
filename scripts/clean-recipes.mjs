// Limpieza puntual: borra recetas e items de una org (para reimportar).
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const slug = process.argv[2];
const org =
  (await sql.query("select id from organization where slug=$1", [slug]))
    .rows?.[0] ??
  (await sql.query("select id from organization where slug=$1", [slug]))[0];
const orgId = org.id;
await sql.query("delete from recipe_items where org_id=$1", [orgId]);
const b = await sql.query("delete from recipes where org_id=$1 returning id", [
  orgId,
]);
console.log("recetas borradas:", (b.rows ?? b).length);
