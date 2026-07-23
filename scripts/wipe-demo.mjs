/**
 * Borra POR COMPLETO la organización demo (slug "demo") y todos sus datos.
 * Uso: node scripts/wipe-demo.mjs   (requiere DATABASE_URL)
 * Pensado para re-sembrar la demo: wipe-demo + seed-demo.
 * Protección: solo opera sobre la org con slug exactamente "demo".
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const q = async (text, params) => {
  const r = await sql.query(text, params);
  return r.rows ?? r;
};

const orgRes = await q(`select id, name from organization where slug = 'demo'`);
if (!orgRes[0]) {
  console.log('No existe la org "demo". Nada que borrar.');
  process.exit(0);
}
const orgId = orgRes[0].id;
console.log(`Borrando org demo ${orgId} (${orgRes[0].name})…`);

// Todas las tablas de negocio llevan org_id; borramos en pasadas repetidas
// hasta que las FKs dejen de estorbar (evita mantener la lista ordenada a mano).
const tables = await q(
  `select distinct table_name from information_schema.columns
   where column_name = 'org_id' and table_schema = 'public'`,
);
let pending = tables.map((t) => t.table_name);
for (let pass = 0; pass < 10 && pending.length > 0; pass++) {
  const next = [];
  for (const t of pending) {
    try {
      const r = await q(`delete from "${t}" where org_id = $1`, [orgId]);
      console.log(`  ${t}: limpio`);
    } catch {
      next.push(t); // FK aún referenciada: reintentar en la próxima pasada
    }
  }
  if (next.length === pending.length) {
    console.error("Sin progreso; quedan:", next.join(", "));
    process.exit(1);
  }
  pending = next;
}

await q(`delete from invitation where organization_id = $1`, [orgId]);
await q(`delete from member where organization_id = $1`, [orgId]);
await q(`delete from organization where id = $1`, [orgId]);
console.log("Org demo eliminada. Lista para re-sembrar con seed-demo.ts");
